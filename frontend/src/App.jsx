import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import { io } from 'socket.io-client';
import { AlertTriangle, MapPin, Camera, Send, Clock, Flame, Shield, LogOut, ArrowUp, ArrowDown, Settings, X, Plus, Download, Upload } from 'lucide-react';
import L from 'leaflet';
import Chatbot from './components/Chatbot';
import './App.css';

const hazardEmojis = {
  'Yırtıcı Hayvan Saldırısı': '🐺',
  'Başıboş Sürü': '🐑',
  'Yaralı Hayvan': '🤕',
  'Enfekte Hayvan': '🦠',
  'Şüpheli Şahıs': '👤'
};

const userIcon = L.divIcon({
  className: 'custom-icon', html: `<div class="user-dot"></div>`, iconSize: [24, 24], iconAnchor: [12, 12]
});

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getTimeAgo = (dateString) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "az önce";
  if (diffMin < 60) return `${diffMin} dakika önce`;
  if (diffHour < 24) return `${diffHour} saat önce`;
  if (diffDay === 1) return "dün";
  return `${diffDay} gün önce`;
};

const getHotspotIcon = (type, reportCount, newestDate, userPrioritiesArray) => {
  let emoji = hazardEmojis[type] || '⚠️';

  const rankIndex = userPrioritiesArray.indexOf(type);
  const rank = String(rankIndex !== -1 ? rankIndex + 1 : 3);

  let bgColor = '#9ca3af';
  if (rank === '1') bgColor = '#7f1d1d';
  else if (rank === '2') bgColor = '#ef4444';
  else if (rank === '3') bgColor = '#ea580c';
  else if (rank === '4') bgColor = '#eab308';
  else if (rank === '5') bgColor = '#3b82f6';

  const diffHours = (new Date().getTime() - new Date(newestDate).getTime()) / (1000 * 60 * 60);

  let opacity = 1.0;
  let pulseSpeed = 0.8;
  let pulseScale = 2.5;

  if (diffHours >= 4) {
    pulseSpeed = 0;
    opacity = 0.6;
    bgColor = '#9ca3af';
  } else if (diffHours >= 2) {
    pulseSpeed = 2.0;
    opacity = 0.85;
    pulseScale = 1.8;
  }

  return L.divIcon({
    className: 'clear-custom-icon',
    html: `
      <div class="hazard-container" style="opacity: ${opacity}; transition: all 0.5s;">
        ${pulseSpeed > 0 ? `<div class="hazard-pulse" style="background-color: ${bgColor}; animation-duration: ${pulseSpeed}s; transform: scale(${pulseScale})"></div>` : ''}
        <div class="hazard-icon" style="background-color: ${bgColor}">${emoji}</div>
        ${reportCount > 1 ? `<div class="hazard-badge">${reportCount}</div>` : ''}
      </div>
    `,
    iconSize: [45, 45],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
  });
};

const groupReportsIntoHotspots = (reports) => {
  const hotspots = [];
  const sortedReports = [...reports].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  sortedReports.forEach(report => {
    const existingHotspot = hotspots.find(h =>
      calculateDistance(h.lat, h.lng, report.lat, report.lng) <= 0.5
    );
    if (existingHotspot) {
      existingHotspot.reports.push(report);
    } else {
      hotspots.push({
        id: `hotspot-${report.id}`,
        lat: report.lat,
        lng: report.lng,
        typeLabel: report.typeLabel,
        reports: [report],
        newestTime: report.created_at
      });
    }
  });
  return hotspots;
};

function ChangeView({ center, zoom }) {
  const map = useMap(); map.setView(center, zoom); return null;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('BiUyariToken'));
  const [currentUser, setCurrentUser] = useState(null);

  const [reports, setReports] = useState([]);
  const [userPos, setUserPos] = useState(null);
  const userPosRef = useRef(null);

  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [importType, setImportType] = useState('append');
  const [exportType, setExportType] = useState('all');

  // --- WHATSAPP BİLDİRİM STATE'LERİ EKLENDİ ---
  const [telegramChatId, setTelegramChatId] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [notificationPref, setNotificationPref] = useState('telegram');
  const [radius, setRadius] = useState(2);

  const [priorities, setPriorities] = useState([
    'Yırtıcı Hayvan Saldırısı',
    'Başıboş Sürü',
    'Yaralı Hayvan',
    'Enfekte Hayvan',
    'Şüpheli Şahıs'
  ]);
  const [availableHazards, setAvailableHazards] = useState([]);

  const moveHazard = (index, direction) => {
    const newPriorities = [...priorities];
    if (direction === -1 && index > 0) {
      [newPriorities[index - 1], newPriorities[index]] = [newPriorities[index], newPriorities[index - 1]];
    } else if (direction === 1 && index < newPriorities.length - 1) {
      [newPriorities[index + 1], newPriorities[index]] = [newPriorities[index], newPriorities[index + 1]];
    }
    setPriorities(newPriorities);
  };

  const removeHazard = (hazardToRemove) => {
    setPriorities(priorities.filter(h => h !== hazardToRemove));
    setAvailableHazards([...availableHazards, hazardToRemove]);
  };

  const addHazard = (hazardToAdd) => {
    setAvailableHazards(availableHazards.filter(h => h !== hazardToAdd));
    setPriorities([...priorities, hazardToAdd]);
  };

  const priorityColors = ['#7f1d1d', '#ef4444', '#ea580c', '#eab308', '#3b82f6'];

  const [filterValue, setFilterValue] = useState(6);
  const [filterUnit, setFilterUnit] = useState('hours');
  const [filterAll, setFilterAll] = useState(false);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapRadius, setHeatmapRadius] = useState(1.5);
  const [dangerAlert, setDangerAlert] = useState(null);

  const [typeLabel, setTypeLabel] = useState('Yırtıcı Hayvan Saldırısı');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);

  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regTelegram, setRegTelegram] = useState('');
  const [regUsername, setRegUsername] = useState('');

  useEffect(() => {
    if (currentUser) {
      if (currentUser.full_name) setRegFullName(currentUser.full_name);
      if (currentUser.username) setRegUsername(currentUser.username);
      if (currentUser.phone_number) setRegPhone(currentUser.phone_number);
      if (currentUser.telegram_chat_id) setRegTelegram(currentUser.telegram_chat_id);
    }
  }, [currentUser]);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
      localStorage.setItem('BiUyariToken', urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, "/");
    }

    if (token || urlToken) {
      const activeToken = urlToken || token;
      fetch(`${BACKEND_URL}/api/auth/profile`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setCurrentUser(data);

          // --- KULLANICININ ESKİ AYARLARINI (WHATSAPP DAHİL) ÇEKİYORUZ ---
          fetch(`${BACKEND_URL}/api/zones/me`, { headers: { 'Authorization': `Bearer ${activeToken}` } })
            .then(res => res.ok ? res.json() : null)
            .then(zoneData => {
              if (zoneData) {
                setTelegramChatId(zoneData.telegramChatId || '');
                setWhatsappNumber(zoneData.whatsappNumber || '');
                setNotificationPref(zoneData.notificationPref || 'telegram');
                setRadius(Number(zoneData.radius) || 2);
              }
            });

          const savedOrder = localStorage.getItem(`priorities_${data?.id}`);
          if (savedOrder) {
            const parsedOrder = JSON.parse(savedOrder);
            setPriorities(parsedOrder);
            const allHazards = Object.keys(hazardEmojis);
            setAvailableHazards(allHazards.filter(h => !parsedOrder.includes(h)));
          }
        })
        .catch(err => console.log("Profil bilgisi çekilemedi."));
    }
  }, [token]);

  const handleGoogleLogin = () => { window.location.href = `${BACKEND_URL}/api/auth/google`; };

  const handleLogout = () => {
    localStorage.removeItem('BiUyariToken');
    setToken(null);
    setCurrentUser(null);
  };

  const playSiren = () => {
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
    audio.play().catch(e => console.log("Ses engellendi"));
  };

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/reports`).then(res => res.json()).then(data => setReports(data));

    const socket = io(BACKEND_URL);
    socket.on('new_report', (newReport) => {
      setReports(prev => [newReport, ...prev]);
      playSiren();

      if (userPosRef.current) {
        const dist = calculateDistance(userPosRef.current.lat, userPosRef.current.lng, newReport.lat, newReport.lng);
        if (dist <= radius) {
          setDangerAlert(`DİKKAT! ${dist.toFixed(1)} km yakınınızda tehlike (${newReport.typeLabel}) bildirildi!`);
          setTimeout(() => setDangerAlert(null), 10000);
        }
      }
    });

    socket.on('vote_updated', (updatedReport) => {
      setReports(prev => prev.map(r => r.id === updatedReport.id ? { ...r, ...updatedReport } : r));
    });

    socket.on('reports_imported', () => {
      fetch(`${BACKEND_URL}/api/reports`).then(res => res.json()).then(data => setReports(data));
    });

    return () => socket.disconnect();
  }, [radius]);

  const locateUser = () => {
    if (!navigator.geolocation) return alert("Konum desteklenmiyor.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coords);
        userPosRef.current = coords;
      },
      (err) => alert("Konum alınamadı.")
    );
  };

  // --- KAYIT FORMU GÜNCELLEMESİ (Omnichannel Validasyonları) ---
  const handleZoneSubmit = async (e) => {
    e.preventDefault();
    if (!userPos) return alert("Lütfen önce 'Beni Bul'a basarak ahırınızın konumunu belirleyin!");

    if ((notificationPref === 'telegram' || notificationPref === 'both') && !telegramChatId) {
      return alert("Lütfen geçerli bir Telegram Chat ID girin.");
    }
    if ((notificationPref === 'whatsapp' || notificationPref === 'both') && !whatsappNumber) {
      return alert("Lütfen geçerli bir WhatsApp Numarası girin.");
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ telegramChatId, whatsappNumber, notificationPref, priorities, lat: userPos.lat, lng: userPos.lng, radius })
      });
      if (response.ok) {
        if (currentUser) localStorage.setItem(`priorities_${currentUser.id}`, JSON.stringify(priorities));
        alert(`Ahırınız koruma altına alındı ve bildirim ayarlarınız güncellendi!`);
        setSettingsOpen(false);
      }
    } catch (error) { alert("Kayıt başarısız oldu."); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userPos) return alert("Lütfen önce 'Beni Bul'a basın!");

    const formData = new FormData();
    formData.append('lat', userPos.lat);
    formData.append('lng', userPos.lng);
    formData.append('typeLabel', typeLabel);
    formData.append('note', note);
    if (photo) formData.append('image', photo);

    try {
      await fetch(`${BACKEND_URL}/api/reports`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      setFormOpen(false); setNote(''); setPhoto(null);
    } catch (error) { alert("Gönderim başarısız."); }
  };

  const handleVote = async (reportId, voteType) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/reports/${reportId}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ voteType })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.message || "İşlem başarısız."); return; }
      alert(data.message);
    } catch (error) { alert("Sunucuya bağlanılamadı."); }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/reports/export?type=${exportType}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Dışa aktarma başarısız oldu.");
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `biuyari_yedek_${exportType}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (importType === 'replace' && !window.confirm("DİKKAT: Haritadaki tüm mevcut veriler silinecek ve sadece dosyadakiler yüklenecek. Onaylıyor musunuz?")) {
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsedData = JSON.parse(event.target.result);
        const res = await fetch(`${BACKEND_URL}/api/admin/reports/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ data: parsedData, importType })
        });

        if (!res.ok) throw new Error("İçe aktarma işlemi başarısız.");
        alert("Veriler başarıyla içeri aktarıldı!");
        setAdminPanelOpen(false);
      } catch (err) {
        alert("Hata: Geçersiz dosya formatı veya sunucu hatası.");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const filteredReports = reports.filter(r => {
    // Öncelik/Tehlike filtresi: Eğer kullanıcı bu tehlikeyi listeden çıkardıysa haritada gösterme
    if (priorities && priorities.length > 0 && !priorities.includes(r.typeLabel)) {
      return false;
    }
    // Eğer tümünü listeden çıkardıysa hiçbir şey gösterme
    if (priorities && priorities.length === 0) {
      return false;
    }

    if (filterAll) return true;

    const now = new Date().getTime();
    const reportTime = new Date(r.created_at).getTime();
    const diffMs = now - reportTime;

    let maxDiffMs = 0;
    const value = Number(filterValue) || 0;

    if (filterUnit === 'minutes') maxDiffMs = value * 60 * 1000;
    else if (filterUnit === 'hours') maxDiffMs = value * 60 * 60 * 1000;
    else if (filterUnit === 'days') maxDiffMs = value * 24 * 60 * 60 * 1000;
    else if (filterUnit === 'months') maxDiffMs = value * 30 * 24 * 60 * 60 * 1000;
    else if (filterUnit === 'years') maxDiffMs = value * 365 * 24 * 60 * 60 * 1000;

    return diffMs <= maxDiffMs;
  });

  const hazardHotspots = groupReportsIntoHotspots(filteredReports);

  if (!token) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
          <AlertTriangle size={64} color="#ef4444" style={{ marginBottom: '20px' }} />
          <h1 style={{ color: '#1f2937', margin: '0 0 10px 0', fontSize: '28px' }}>BiUyarı</h1>
          <p style={{ color: '#6b7280', margin: '0 0 30px 0', fontSize: '15px', lineHeight: '1.5' }}>
            Sahte ihbarları önlemek ve sürünüzü güvenle korumak için sisteme giriş yapmanız gerekmektedir.
          </p>
          <button
            onClick={handleGoogleLogin}
            style={{ width: '100%', padding: '14px', fontSize: '16px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'background-color 0.2s' }}
          >
            Google ile Giriş Yap
          </button>
        </div>
      </div>
    );
  }

  if (currentUser && (!currentUser.phone_number || !currentUser.username)) {
    const handleProfileSubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ full_name: regFullName, phone_number: regPhone, telegram_chat_id: regTelegram, username: regUsername })
        });
        if (res.ok) {
          const updatedUser = await res.json();
          setCurrentUser(updatedUser);
          alert("Kayıt başarıyla tamamlandı!");
        } else {
          alert("Güncelleme başarısız oldu.");
        }
      } catch (err) {
        alert("Bir hata oluştu.");
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
        <form onSubmit={handleProfileSubmit} style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxWidth: '400px', width: '90%', boxSizing: 'border-box' }}>
          <h2 style={{ textAlign: 'center', color: '#1f2937', marginBottom: '20px', marginTop: 0 }}>Profilinizi Tamamlayın</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>Sistemi kullanmaya başlamak için lütfen aşağıdaki bilgileri doldurun.</p>

          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#4b5563', fontWeight: 'bold' }}>Tam Adınız</label>
          <input type="text" value={regFullName} onChange={e => setRegFullName(e.target.value)} required style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />

          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#4b5563', fontWeight: 'bold' }}>Kullanıcı Adı</label>
          <input type="text" value={regUsername} onChange={e => setRegUsername(e.target.value)} required placeholder="Örn: ahmet123" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />

          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#4b5563', fontWeight: 'bold' }}>Telefon Numaranız</label>
          <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} required placeholder="Örn: 0555 123 45 67" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />

          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#4b5563', fontWeight: 'bold' }}>Telegram Chat ID (İsteğe Bağlı)</label>
          <input type="text" value={regTelegram} onChange={e => setRegTelegram(e.target.value)} placeholder="Örn: 123456789" style={{ width: '100%', padding: '10px', marginBottom: '25px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />

          <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>Kaydı Tamamla</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1><AlertTriangle className="icon" /> BiUyarı</h1>
        <div className="header-buttons">
          {currentUser && (
            <span style={{ marginRight: '10px', padding: '5px 10px', borderRadius: '15px', backgroundColor: currentUser.role === 'admin' ? '#fef08a' : '#e0e7ff', color: currentUser.role === 'admin' ? '#854d0e' : '#3730a3', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
              {currentUser.role === 'admin' ? `👑 ${currentUser.username || 'Yönetici'}` : `👤 ${currentUser.username || 'Kullanıcı'}`}
            </span>
          )}
          {currentUser && currentUser.role === 'admin' && (
            <button onClick={() => { setAdminPanelOpen(true); setSettingsOpen(false); setFormOpen(false); }} className="btn-icon" style={{ backgroundColor: '#fef08a', color: '#854d0e', border: 'none', marginLeft: '5px', fontWeight: 'bold' }}>
              Dosya İşlemleri
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <button onClick={() => setShowHeatmap(!showHeatmap)} className={`btn-icon ${showHeatmap ? 'active' : ''}`}>
              <Flame size={18} /> Isı Haritası
            </button>
            {showHeatmap && (
              <select
                value={heatmapRadius}
                onChange={(e) => setHeatmapRadius(Number(e.target.value))}
                style={{ padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: 'white' }}
              >
                <option value="0.5">500 m</option>
                <option value="1">1 KM</option>
                <option value="1.5">1.5 KM</option>
                <option value="3">3 KM</option>
                <option value="5">5 KM</option>
                <option value="10">10 KM</option>
              </select>
            )}
          </div>

          <button onClick={locateUser} className="btn-locate">
            <MapPin size={18} /> Beni Bul
          </button>
          <button onClick={() => { setSettingsOpen(true); setFormOpen(false); }} className="btn-icon" style={{ backgroundColor: '#f3f4f6', color: '#1f2937', border: 'none', marginLeft: '5px' }}>
            <Settings size={18} />
          </button>
          <button onClick={handleLogout} className="btn-icon" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: 'none', marginLeft: '5px' }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* MODERN VE GRUPLANMIŞ ZAMAN FİLTRESİ (UX DÜZELTİLDİ) */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', padding: '12px 16px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4b5563' }}>
          <Clock size={18} />
          <span style={{ fontSize: '14px', fontWeight: '600' }}>Zaman Filtresi:</span>
        </div>

        {/* Tüm kontrolleri tutan gri hap (pill) kapsayıcı */}
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>

          <button
            className={filterAll ? 'active' : ''}
            onClick={() => setFilterAll(true)}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              backgroundColor: filterAll ? '#3b82f6' : 'transparent',
              color: filterAll ? 'white' : '#64748b',
              transition: 'all 0.2s',
              boxShadow: filterAll ? '0 2px 4px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          >
            Tümü
          </button>

          {/* Araya dikey ve ince bir ayırıcı çizgi (Divider) */}
          <div style={{ width: '1px', height: '20px', backgroundColor: '#cbd5e1', margin: '0 8px' }}></div>

          {/* Tümü seçiliyse bu kısım soluklaşır, tıklanırsa tekrar aktifleşip Tümü'nü kapatır */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: filterAll ? 0.4 : 1, transition: 'opacity 0.2s' }}>
            <span style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>Son</span>
            <input
              type="number"
              value={filterValue}
              onChange={(e) => { setFilterValue(e.target.value); setFilterAll(false); }}
              min="1"
              style={{ width: '55px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center', outline: 'none' }}
            />
            <select
              value={filterUnit}
              onChange={(e) => { setFilterUnit(e.target.value); setFilterAll(false); }}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white', fontSize: '13px', cursor: 'pointer', outline: 'none' }}
            >
              <option value="minutes">Dakika</option>
              <option value="hours">Saat</option>
              <option value="days">Gün</option>
              <option value="months">Ay</option>
              <option value="years">Yıl</option>
            </select>
          </div>

        </div>
      </div>

      {dangerAlert && <div className="danger-banner animate-pulse">🚨 {dangerAlert}</div>}

      <main className="map-wrapper">
        <MapContainer center={[37.7183, 30.2823]} zoom={8} className="map">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {userPos && <ChangeView center={[userPos.lat, userPos.lng]} zoom={15} />}
          {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}><Popup>Sizin Konumunuz</Popup></Marker>}

          {!showHeatmap && hazardHotspots.map((hotspot) => (
            <Marker
              key={hotspot.id}
              position={[hotspot.lat, hotspot.lng]}
              icon={getHotspotIcon(hotspot.typeLabel, hotspot.reports.length, hotspot.newestTime, priorities)}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 5px 0', color: '#1f2937' }}>Bölge İhbarları</h3>
                  {hotspot.reports.length > 1 ? (
                    <span style={{ fontSize: '12px', background: '#fee2e2', padding: '4px 8px', borderRadius: '12px', color: '#b91c1c', fontWeight: 'bold' }}>
                      ⚠️ Aynı bölgeden {hotspot.reports.length} bildirim var!
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Tekil İhbar</span>
                  )}
                </div>
                <hr style={{ margin: '10px 0', borderTop: '1px solid #e5e7eb' }} />

                <div style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '5px' }}>
                  {hotspot.reports.map((r, index) => (
                    <div key={index} style={{ marginBottom: '12px', fontSize: '13px', background: '#f9fafb', padding: '10px', borderRadius: '8px', borderLeft: index === 0 ? '3px solid #ef4444' : 'none' }}>

                      {index === 0 && hotspot.reports.length > 1 && (
                        <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 'bold', marginBottom: '5px' }}>🔥 EN GÜNCEL İHBAR</div>
                      )}

                      <div style={{ fontWeight: 'bold', color: '#b91c1c', marginBottom: '6px', fontSize: '14px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
                        🚨 {r.typeLabel}
                      </div>

                      <strong style={{ color: '#4b5563' }}>Kullanıcı Notu:</strong> {r.note || 'Belirtilmemiş'}
                      <br />
                      <small style={{ color: '#9ca3af' }}>
                        {new Date(r.created_at).toLocaleString('tr-TR')} <span style={{ fontWeight: '500', color: '#6b7280' }}>({getTimeAgo(r.created_at)})</span>
                      </small>

                      {r.imageUrl && (
                        <img src={r.imageUrl} alt="Tehlike" style={{ width: '100%', borderRadius: '5px', marginTop: '6px' }} />
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                        <button
                          disabled={!currentUser || Number(currentUser.id) === Number(r.user_id)}
                          onClick={() => handleVote(r.id, 'up')}
                          style={{
                            opacity: (!currentUser || Number(currentUser.id) === Number(r.user_id)) ? 0.5 : 1,
                            cursor: (!currentUser || Number(currentUser.id) === Number(r.user_id)) ? 'not-allowed' : 'pointer',
                            background: '#ecfdf5', color: '#059669', border: 'none', padding: '4px 8px', borderRadius: '5px', display: 'flex', gap: '4px'
                          }}
                        >
                          👍 <strong>{r.up_votes || 0}</strong>
                        </button>

                        <button
                          disabled={!currentUser || Number(currentUser.id) === Number(r.user_id)}
                          onClick={() => handleVote(r.id, 'down')}
                          style={{
                            opacity: (!currentUser || Number(currentUser.id) === Number(r.user_id)) ? 0.5 : 1,
                            cursor: (!currentUser || Number(currentUser.id) === Number(r.user_id)) ? 'not-allowed' : 'pointer',
                            background: '#fef2f2', color: '#dc2626', border: 'none', padding: '4px 8px', borderRadius: '5px', display: 'flex', gap: '4px'
                          }}
                        >
                          👎 <strong>{r.down_votes || 0}</strong>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Popup>
            </Marker>
          ))}

          {showHeatmap && filteredReports.map((r) => (
            <Circle key={`heat-${r.id}`} center={[r.lat, r.lng]} radius={heatmapRadius * 1000} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.3, stroke: false }} />
          ))}
        </MapContainer>
      </main>

      {!formOpen && !settingsOpen && !userPos && (
        <div className="map-hint" style={{ backgroundColor: '#ef4444' }}>
          📍 İşlem yapabilmek için önce 'Beni Bul'a basın
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', padding: '0 15px 15px 15px', maxWidth: '800px', margin: '0 auto' }}>
        <button
          className="btn-add-report"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          onClick={() => { setFormOpen(!formOpen); setSettingsOpen(false); }}
        >
          {formOpen ? 'İptal' : <><AlertTriangle size={20} /> Tehlike Bildir</>}
        </button>
      </div>

      {/* AYARLAR MODALI */}
      {settingsOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
              <h3 style={{ margin: 0, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={22} color="#3b82f6" /> Ayarlar
              </h3>
              <button type="button" onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleZoneSubmit} style={{ padding: '20px' }}>

              {/* --- YENİ EKLENEN ÇOK KANALLI BİLDİRİM FORMU --- */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#374151', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={16} /> Radar ve Bildirim Ayarları</h4>

                <select value={notificationPref} onChange={(e) => setNotificationPref(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: 'white', boxSizing: 'border-box' }}>
                  <option value="telegram">Sadece Telegram'dan Bildirim Al</option>
                  <option value="whatsapp">Sadece WhatsApp'tan Bildirim Al</option>
                  <option value="both">Her İkisinden de Bildirim Al</option>
                </select>

                {(notificationPref === 'telegram' || notificationPref === 'both') && (
                  <input type="text" placeholder="Telegram Chat ID (Örn: 123456789)" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} />
                )}

                {(notificationPref === 'whatsapp' || notificationPref === 'both') && (
                  <input type="text" placeholder="WhatsApp Numaranız (Örn: 5551234567)" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} />
                )}

                <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: 'white', boxSizing: 'border-box' }}>
                  <option value="1">Çok Yakın Çevre (1 KM Yarıçap)</option>
                  <option value="2">Yakın Çevre (2 KM Yarıçap)</option>
                  <option value="5">Normal Bölge (5 KM Yarıçap)</option>
                  <option value="15">Geniş Bölge (15 KM Yarıçap)</option>
                  <option value="30">Çok Geniş Bölge (30 KM Yarıçap)</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#374151', fontSize: '15px' }}>Tehlike Öncelik Sıralaması</h4>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.4' }}>
                  Harita renklerini belirlemek için tehlikeleri aşağı/yukarı taşıyın veya çıkarın.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  {priorities.map((hazard, index) => (
                    <div key={hazard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', borderLeft: `5px solid ${priorityColors[index] || '#9ca3af'}`, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: priorityColors[index] || '#64748b', fontSize: '14px', width: '20px' }}>{index + 1}.</span>
                        <span style={{ fontSize: '18px' }}>{hazardEmojis[hazard]}</span>
                        <span style={{ fontSize: '14px', color: '#334155', fontWeight: '500' }}>{hazard}</span>
                      </div>



                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button type="button" onClick={() => moveHazard(index, -1)} disabled={index === 0} style={{ background: 'none', border: 'none', padding: '2px', cursor: index === 0 ? 'not-allowed' : 'pointer', color: index === 0 ? '#cbd5e1' : '#64748b' }}><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => moveHazard(index, 1)} disabled={index === priorities.length - 1} style={{ background: 'none', border: 'none', padding: '2px', cursor: index === priorities.length - 1 ? 'not-allowed' : 'pointer', color: index === priorities.length - 1 ? '#cbd5e1' : '#64748b' }}><ArrowDown size={14} /></button>
                        </div>
                        <button type="button" onClick={() => removeHazard(hazard)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '5px' }} title="Listeden Çıkar">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {availableHazards.length > 0 && (
                  <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px dashed #cbd5e1' }}>
                    <h5 style={{ margin: '0 0 10px 0', color: '#64748b', fontSize: '13px' }}>Eklenebilecek Tehlikeler</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {availableHazards.map(hazard => (
                        <div key={hazard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '8px', border: '1px dashed #cbd5e1', opacity: 0.8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '16px' }}>{hazardEmojis[hazard]}</span>
                            <span style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>{hazard}</span>
                          </div>
                          <button type="button" onClick={() => addHazard(hazard)} style={{ background: '#dcfce7', border: 'none', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            <Plus size={14} /> Ekle
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '30px' }}>
                <button type="submit" style={{ width: '100%', padding: '14px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                  <Shield size={18} /> Kaydet ve Kapat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YÖNETİCİ MODALI */}
      {adminPanelOpen && currentUser?.role === 'admin' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
              <h3 style={{ margin: 0, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Dosya İşlemleri
              </h3>
              <button type="button" onClick={() => setAdminPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#374151', fontSize: '15px' }}>Veri Yedekleme (Dışa Aktar)</h4>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '15px', lineHeight: '1.4' }}>
                Sistemden hangi verileri yedeklemek istediğinizi seçin. Seçtiğiniz verilere bağlı olan kullanıcı profilleri (WordPress mantığıyla) otomatik olarak dosyaya dahil edilecektir.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="radio" name="exportType" value="all" checked={exportType === 'all'} onChange={() => setExportType('all')} />
                  Tüm Veritabanı (İhbarlar, Kullanıcılar, Bölgeler)
                </label>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="radio" name="exportType" value="reports" checked={exportType === 'reports'} onChange={() => setExportType('reports')} />
                  Sadece İhbarlar ve Oylar
                </label>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="radio" name="exportType" value="zones" checked={exportType === 'zones'} onChange={() => setExportType('zones')} />
                  Sadece Kayıtlı Bölgeler
                </label>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="radio" name="exportType" value="users" checked={exportType === 'users'} onChange={() => setExportType('users')} />
                  Sadece Kullanıcı Listesi
                </label>
              </div>

              <button
                onClick={handleExport}
                style={{ width: '100%', padding: '14px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', marginBottom: '25px' }}
              >
                <Download size={18} /> Seçili Verileri İndir (Yedekle)
              </button>

              <div style={{ border: '1px dashed #cbd5e1', padding: '15px', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                <h5 style={{ margin: '0 0 10px 0', color: '#475569', fontSize: '14px' }}>📥 İçe Aktar (Geri Yükle)</h5>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="importType" value="append" checked={importType === 'append'} onChange={() => setImportType('append')} />
                    Mevcut verilere ekle (Yeni kayıt olarak)
                  </label>
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="importType" value="update" checked={importType === 'update'} onChange={() => setImportType('update')} />
                    Eşleşen kayıtları güncelle (Değişenleri yansıt)
                  </label>
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input type="radio" name="importType" value="replace" checked={importType === 'replace'} onChange={() => setImportType('replace')} />
                    Tüm veritabanını sil ve dosyayla değiştir
                  </label>
                </div>

                <label style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxSizing: 'border-box' }}>
                  <Upload size={18} /> JSON Dosyası Seç ve Yükle
                  <input type="file" accept=".json" hidden onChange={handleImport} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <form className="report-form" onSubmit={handleSubmit}>
          <h3>Tehlike Bildirimi</h3>
          <select value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)}>
            <option value="Yırtıcı Hayvan Saldırısı">🐺 Yırtıcı Hayvan Saldırısı</option>
            <option value="Başıboş Sürü">🐑 Başıboş Sürü</option>
            <option value="Yaralı Hayvan">🤕 Yaralı Hayvan</option>
            <option value="Enfekte Hayvan">🦠 Enfekte Hayvan</option>
            <option value="Şüpheli Şahıs">👤 Şüpheli Şahıs</option>
          </select>
          <textarea placeholder="Detaylı not..." value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: '10px' }} />
          <label className="file-label"><Camera size={18} /> Fotoğraf Ekle<input type="file" onChange={(e) => setPhoto(e.target.files[0])} accept="image/*" hidden /></label>
          {photo && <small style={{ color: '#10b981' }}>✓ {photo.name}</small>}
          <button type="submit" className="btn-submit"><Send size={18} /> Gönder</button>
        </form>
      )}

      <Chatbot />
    </div>
  );
}

export default App;