import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles } from 'lucide-react';

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { text: "Merhaba! Ben BiUyarı akıllı asistanıyım. Mera güvenliği, uygulamamızın kullanımı veya istatistikler hakkında bana her şeyi sorabilirsiniz.", isBot: true }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const [suggestedQuestions] = useState([
    "Son 5 günde kaç tane yırtıcı hayvan saldırısı oldu?",
    "Telegram chat ID nasıl alınır?",
    "Tehlike bildirimi nasıl yapabilirim?"
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const submitMessage = async (userMessage) => {
    if (!userMessage.trim()) return;
    setInput('');
    setMessages(prev => [...prev, { text: userMessage, isBot: false }]);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('BiUyariToken');
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMessage })
      });

      if (response.status === 401 || response.status === 403) {
        setMessages(prev => [...prev, { text: "Asistanı kullanabilmek için lütfen uygulamanın ana ekranından Google ile giriş yapın.", isBot: true }]);
        setIsLoading(false);
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setMessages(prev => [...prev, { text: data.reply, isBot: true }]);
      } else {
        setMessages(prev => [...prev, { text: "Bir hata oluştu: " + (data.error || "Bilinmeyen hata"), isBot: true }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { text: "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.", isBot: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    submitMessage(input);
  };

  return (
    <div className="chatbot-container" style={{ position: 'fixed', right: '24px', zIndex: 9999, fontFamily: 'system-ui, sans-serif' }}>
      {/* Sohbet Penceresi */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '70px',
          right: '0',
          width: '350px',
          backgroundColor: 'var(--chatbot-bg)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          height: '500px',
          maxHeight: '80vh',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(to right, #22c55e, #16a34a)',
            padding: '16px',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={24} />
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>BiUyarı Asistan</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#dcfce7' }}>Çevrimiçi</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-panel)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex',
                gap: '8px',
                maxWidth: '85%',
                alignSelf: msg.isBot ? 'flex-start' : 'flex-end',
                flexDirection: msg.isBot ? 'row' : 'row-reverse'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backgroundColor: msg.isBot ? 'var(--chatbot-bot-icon-bg)' : '#dbeafe',
                  color: msg.isBot ? 'var(--chatbot-bot-icon)' : '#2563eb'
                }}>
                  {msg.isBot ? <Bot size={16} /> : <User size={16} />}
                </div>
                <div style={{
                  padding: '12px',
                  borderRadius: '16px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  backgroundColor: msg.isBot ? 'var(--chatbot-msg-bot)' : 'var(--chatbot-msg-user)',
                  color: msg.isBot ? 'var(--chatbot-msg-bot-text)' : 'var(--chatbot-msg-user-text)',
                  borderTopLeftRadius: msg.isBot ? '0' : '16px',
                  borderTopRightRadius: msg.isBot ? '16px' : '0',
                  border: msg.isBot ? '1px solid var(--border-light)' : 'none'
                }}>
                  {msg.text.split('\n').map((line, i) => (
                    <span key={i}>
                      {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                      {i !== msg.text.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {/* Sıkça Sorulan Sorular (Sadece ilk mesajda göster) */}
            {messages.length === 1 && !isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px', paddingLeft: '40px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>Sıkça Sorulan Sorular:</p>
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => submitMessage(q)}
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '12px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      alignSelf: 'flex-start'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--chatbot-bot-icon-bg)'; e.currentTarget.style.borderColor = 'var(--chatbot-bot-icon)'; e.currentTarget.style.color = 'var(--chatbot-bot-icon)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-input)'; e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {isLoading && (
              <div style={{ display: 'flex', gap: '8px', maxWidth: '85%', alignSelf: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--chatbot-bot-icon-bg)', color: 'var(--chatbot-bot-icon)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={16} />
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--chatbot-msg-bot)', borderRadius: '16px', borderTopLeftRadius: '0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '14px', border: '1px solid var(--border-light)' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Yazıyor...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} style={{
            padding: '12px',
            backgroundColor: 'var(--chatbot-bg)',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            gap: '8px'
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bir soru sorun..."
              style={{
                flex: 1,
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid transparent',
                borderRadius: '9999px',
                padding: '8px 16px',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => { e.target.style.backgroundColor = 'var(--bg-input-focus)'; e.target.style.borderColor = 'var(--border-focus)'; }}
              onBlur={(e) => { e.target.style.backgroundColor = 'var(--bg-input)'; e.target.style.borderColor = 'transparent'; }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              style={{
                backgroundColor: (!input.trim() || isLoading) ? '#9ca3af' : '#22c55e',
                color: 'white',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: (!input.trim() || isLoading) ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              <Send size={18} style={{ marginLeft: '2px' }} />
            </button>
          </form>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-chatbot"
        style={{
          width: '64px',
          height: '64px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
          borderRadius: '50%',
          boxShadow: '0 0 20px rgba(16, 185, 129, 0.5), inset 0 0 10px rgba(255,255,255,0.3)',
          border: '2px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          transform: isOpen ? 'scale(0) rotate(-90deg)' : 'scale(1) rotate(0deg)',
          opacity: isOpen ? 0 : 1,
          animation: isOpen ? 'none' : 'float-pulse 3s ease-in-out infinite',
          position: 'relative'
        }}
        onMouseOver={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(16, 185, 129, 0.8), inset 0 0 15px rgba(255,255,255,0.5)';
          }
        }}
        onMouseOut={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5), inset 0 0 10px rgba(255,255,255,0.3)';
          }
        }}
      >
        <Bot size={32} strokeWidth={1.5} />
        {/* Minik yapay zeka pırıltısı */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', animation: 'spin-slow 4s linear infinite' }}>
          <Sparkles size={14} color="#fef08a" fill="#fef08a" />
        </div>
      </button>

      {/* Animasyonlar İçin CSS */}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
        @keyframes float-pulse {
          0% { transform: translateY(0px) scale(1); box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
          50% { transform: translateY(-5px) scale(1.02); box-shadow: 0 0 30px rgba(16, 185, 129, 0.7); }
          100% { transform: translateY(0px) scale(1); box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
        }
      `}</style>
    </div>
  );
};

export default Chatbot;
