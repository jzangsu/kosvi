import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Calendar, FileText, Bell, Plus, Trash2, Download, Search, 
  Clock, MapPin, Briefcase, Loader2, UserCheck, Users, 
  MessageCircle, Send, ChevronLeft, ChevronRight, Printer, 
  X, Edit2, Sparkles, Zap, Calculator, DollarSign, CalendarDays,
  CheckSquare, FileImage, CreditCard, CheckCircle2, AlertCircle,
  RefreshCw, ArrowRightLeft
} from 'lucide-react';

// Firebase 설정
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'kosvi-travel-manager';
const apiKey = ""; 

const ADMIN_EMAIL = 'admin@daewoongvina.com';

const App = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('schedules'); 
  const [viewMode, setViewMode] = useState('calendar');
  
  const [quotes, setQuotes] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // AI 및 모달 상태
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiBriefing, setAiBriefing] = useState("");
  const [upcomingAlerts, setUpcomingAlerts] = useState([]);
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  
  // 견적서 및 예약 관련 상태
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false); 
  const [selectedQuote, setSelectedQuote] = useState(null); 
  const [reservationQuote, setReservationQuote] = useState(null); 
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  
  // 상세 견적 아이템 상태
  const [quoteItems, setQuoteItems] = useState([]);
  
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  
  const [newQuote, setNewQuote] = useState({ 
    title: '', client: '', type: 'Package', pax: 4, 
    period: '', startDate: '', endDate: '', // 날짜 필드 추가
    totalNetCost: 0, totalSalesPrice: 0, aiMemo: '',
    currency: 'KRW', exchangeRate: 18
  });
  const [newSchedule, setNewSchedule] = useState({ title: '', date: '', time: '', location: '', memo: '' });
  const [currentDate, setCurrentDate] = useState(new Date());

  // Gemini API
  const callGeminiAI = async (prompt, systemPrompt) => {
    setIsAiLoading(true);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('API request failed');
        const result = await response.json();
        setIsAiLoading(false);
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (error) {
        if (i === 4) {
          setIsAiLoading(false);
          return "AI 응답을 가져오는 데 실패했습니다.";
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const generateDailyBriefing = async () => {
    const today = new Date().toISOString().split('T')[0];
    const todaySchedules = schedules.filter(s => s.date === today);
    if (todaySchedules.length === 0) {
      setAiBriefing("오늘 등록된 일정이 없습니다.");
      return;
    }
    const scheduleText = todaySchedules.map(s => `[${s.time}] ${s.title} @ ${s.location}`).join('\n');
    const prompt = `오늘의 일정 리스트입니다:\n${scheduleText}\n이 일정들을 분석하여 법인장님께 드릴 핵심 주의사항 3가지를 한국어로 브리핑해주세요.`;
    const result = await callGeminiAI(prompt, "당신은 KOSVI 여행사 수석 비서입니다.");
    setAiBriefing(result);
  };

  const suggestQuoteDraft = async () => {
    if (!newQuote.title) return;
    const prompt = `프로젝트명: ${newQuote.title}, 고객: ${newQuote.client}, 인원: ${newQuote.pax}명. 베트남 호치민/다낭 3박 5일 추천 일정과 예상 견적(KRW) 초안 작성.`;
    const result = await callGeminiAI(prompt, "당신은 여행 견적 전문가입니다.");
    setNewQuote(prev => ({ ...prev, aiMemo: result }));
  };

  const handleAiTranslate = async (msgText) => {
    const prompt = `메시지: "${msgText}"\n한국어면 베트남어로, 베트남어면 한국어로 번역하고 정중한 답장 추천.`;
    const result = await callGeminiAI(prompt, "당신은 비즈니스 통역가입니다.");
    setChatInput(`[AI 추천]: ${result}`);
  };

  // Auth & Data Subscription
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Auth error:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      const checkAdmin = currentUser?.email === ADMIN_EMAIL || !currentUser?.isAnonymous;
      setIsAdmin(checkAdmin);
      if (checkAdmin) setActiveTab('quotes');
      else setActiveTab('schedules');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubQuotes = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'quotes'), (snap) => {
      setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    });
    const unsubSchedules = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), (snap) => {
      setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    const unsubMessages = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), (snap) => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)));
    });
    const timer = setInterval(() => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const upcoming = schedules.filter(s => {
            if (s.date !== today) return false;
            const [h, m] = s.time.split(':').map(Number);
            const sTime = new Date(); sTime.setHours(h, m, 0);
            const diffMin = (sTime - now) / (1000 * 60);
            return diffMin > -30 && diffMin <= 180;
        });
        setUpcomingAlerts(upcoming);
    }, 60000);
    return () => { unsubQuotes(); unsubSchedules(); unsubMessages(); clearInterval(timer); };
  }, [user, schedules.length]);

  // --- 상세 견적 로직 ---
  
  const getConvertedPrice = (vndAmount, currency, rate) => {
    if (!vndAmount) return 0;
    if (currency === 'VND') return vndAmount;
    return Math.round(vndAmount / rate);
  };

  const addQuoteItem = () => {
    setQuoteItems([...quoteItems, { 
      day: 1, time: '09:00', category: 'TOUR', description: '', 
      qty: 1, netUnit: 0, salesUnit: 0, netCost: 0, salesPrice: 0,
      reservationStatus: 'Pending', voucher: '', vendorPaid: false 
    }]);
  };

  const removeQuoteItem = (index) => {
    const newItems = [...quoteItems];
    newItems.splice(index, 1);
    setQuoteItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...quoteItems];
    newItems[index][field] = value;
    if (['qty', 'netUnit', 'salesUnit'].includes(field)) {
        const qty = Number(newItems[index].qty || 0);
        const netUnit = Number(newItems[index].netUnit || 0);
        const salesUnit = Number(newItems[index].salesUnit || 0);
        
        newItems[index].netCost = qty * netUnit;
        newItems[index].salesPrice = qty * salesUnit;
    }
    setQuoteItems(newItems);
    const net = newItems.reduce((sum, item) => sum + Number(item.netCost || 0), 0);
    const sales = newItems.reduce((sum, item) => sum + Number(item.salesPrice || 0), 0);
    setNewQuote(prev => ({ ...prev, totalNetCost: net, totalSalesPrice: sales }));
  };

  const handleReservationChange = (index, field, value) => {
    const newItems = [...reservationQuote.items];
    newItems[index][field] = value;
    setReservationQuote(prev => ({ ...prev, items: newItems }));
  };

  const handleQuoteDateChange = (field, value) => {
    const updatedQuote = { ...newQuote, [field]: value };
    
    // 시작일과 종료일이 모두 있으면 텍스트 자동 완성
    if (updatedQuote.startDate && updatedQuote.endDate) {
       updatedQuote.period = `${updatedQuote.startDate} ~ ${updatedQuote.endDate}`;
    }
    setNewQuote(updatedQuote);
  };

  const handleSaveQuote = async () => {
    if (!isAdmin || !newQuote.title) return;
    try {
      const dataToSave = { ...newQuote, items: quoteItems, updatedAt: serverTimestamp() };
      if (editingQuoteId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotes', editingQuoteId), dataToSave);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'quotes'), {
          ...dataToSave, status: 'Draft', createdAt: serverTimestamp(), authorId: user.uid 
        });
      }
      closeQuoteModal();
    } catch (e) { console.error(e); }
  };

  const handleSaveReservation = async () => {
    if (!reservationQuote) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotes', reservationQuote.id), {
        items: reservationQuote.items,
        updatedAt: serverTimestamp()
      });
      setIsReservationModalOpen(false);
      setReservationQuote(null);
    } catch (e) { console.error(e); }
  };

  const openEditQuoteModal = (quote) => {
    setEditingQuoteId(quote.id);
    setNewQuote({
      title: quote.title, client: quote.client, type: quote.type, pax: quote.pax,
      period: quote.period || '', 
      startDate: quote.startDate || '', endDate: quote.endDate || '', // 날짜 불러오기
      totalNetCost: quote.totalNetCost || 0, totalSalesPrice: quote.totalSalesPrice || 0,
      aiMemo: quote.aiMemo || '',
      currency: quote.currency || 'KRW',
      exchangeRate: quote.exchangeRate || 18
    });
    setQuoteItems(quote.items || []);
    setIsQuoteModalOpen(true);
  };

  const openReservationModal = (quote) => {
    const itemsWithRes = (quote.items || []).map(item => ({
      ...item,
      reservationStatus: item.reservationStatus || 'Pending',
      voucher: item.voucher || '',
      vendorPaid: item.vendorPaid || false
    }));
    setReservationQuote({ ...quote, items: itemsWithRes });
    setIsReservationModalOpen(true);
  };

  const closeQuoteModal = () => {
    setIsQuoteModalOpen(false);
    setEditingQuoteId(null);
    setNewQuote({ 
      title: '', client: '', type: 'Package', pax: 4, 
      period: '', startDate: '', endDate: '',
      totalNetCost: 0, totalSalesPrice: 0, aiMemo: '', currency: 'KRW', exchangeRate: 18 
    });
    setQuoteItems([]);
  };

  const handleDateClick = (day) => {
    if (!day) return;
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setNewSchedule({ ...newSchedule, date: dateStr, time: '09:00' });
    setIsScheduleModalOpen(true);
  };
  const handleAddSchedule = async () => {
    if (!newSchedule.title || !newSchedule.date) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), {
      ...newSchedule, createdAt: serverTimestamp(), authorName: isAdmin ? "Heo Chang-soo" : "Staff", authorId: user.uid
    });
    setIsScheduleModalOpen(false);
    setNewSchedule({ title: '', date: '', time: '', location: '', memo: '' });
  };
  const handleSendMessage = async (e) => {
    e.preventDefault(); if (!chatInput.trim()) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
      text: chatInput, authorName: isAdmin ? "Giám đốc Heo" : "Staff", authorId: user.uid, createdAt: serverTimestamp(), role: isAdmin ? 'admin' : 'staff'
    });
    setChatInput('');
  };
  const handleDeleteData = async (collName, id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', collName, id));
  };

  const { firstDay, lastDate } = (() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return { firstDay: new Date(year, month, 1).getDay(), lastDate: new Date(year, month + 1, 0).getDate() };
  })();
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= lastDate; d++) calendarDays.push(d);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-30 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg"><Briefcase size={22} /></div>
          <div><h1 className="text-lg font-black tracking-tight leading-none uppercase">KOSVI TRAVEL</h1><p className="text-[10px] text-slate-400 font-bold mt-1 uppercase italic">Multi-Currency System</p></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <button onClick={() => setIsNotiOpen(!isNotiOpen)} className={`p-2.5 rounded-xl relative ${upcomingAlerts.length > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
              <Bell size={22} />
              {upcomingAlerts.length > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black">{upcomingAlerts.length}</span>}
            </button>
            {isNotiOpen && (
              <div className="absolute right-0 mt-3 w-80 bg-white border border-slate-200 shadow-xl rounded-2xl p-4 z-50">
                <h4 className="text-xs font-black uppercase mb-3">Alarms</h4>
                {upcomingAlerts.map(a => <div key={a.id} className="text-sm border-b py-2">{a.time} {a.title}</div>)}
              </div>
            )}
          </div>
          <div className="text-right hidden sm:block"><p className="text-xs font-black">{isAdmin ? "허창수 법인장님" : "KOSVI Staff"}</p><p className="text-[10px] text-emerald-600 font-bold uppercase">● Online</p></div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md ${isAdmin ? 'bg-indigo-600' : 'bg-slate-400'}`}>{isAdmin ? <UserCheck size={20} /> : <Users size={20} />}</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-64 bg-white border-r border-slate-200 p-4 hidden lg:flex flex-col gap-2 shrink-0">
          {isAdmin && (
            <button onClick={() => setActiveTab('quotes')} className={`nav-btn ${activeTab === 'quotes' ? 'active' : ''}`}>
              <FileText size={18} /><div className="text-left leading-none"><span className="text-sm font-bold">견적서 관리</span><p className="text-[9px] uppercase opacity-50 mt-1">Quotation</p></div>
            </button>
          )}
          {!isAdmin && (
             <button onClick={() => setActiveTab('quotes')} className={`nav-btn ${activeTab === 'quotes' ? 'active' : ''}`}>
               <CheckSquare size={18} /><div className="text-left leading-none"><span className="text-sm font-bold">예약 진행</span><p className="text-[9px] uppercase opacity-50 mt-1">Reservations</p></div>
             </button>
          )}
          <button onClick={() => setActiveTab('schedules')} className={`nav-btn ${activeTab === 'schedules' ? 'active' : ''}`}>
            <Calendar size={18} /><div className="text-left leading-none"><span className="text-sm font-bold">일정 관리</span><p className="text-[9px] uppercase opacity-50 mt-1">Schedule</p></div>
          </button>
          <button onClick={() => setActiveTab('messenger')} className={`nav-btn ${activeTab === 'messenger' ? 'active' : ''}`}>
            <MessageCircle size={18} /><div className="text-left leading-none"><span className="text-sm font-bold">메신저</span><p className="text-[9px] uppercase opacity-50 mt-1">Messenger</p></div>
          </button>
        </nav>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative bg-slate-50/50">
          {activeTab === 'quotes' && (
            <div className="max-w-7xl mx-auto animate-in fade-in duration-300">
               <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black italic tracking-tighter underline decoration-blue-500 decoration-4 underline-offset-8">
                  {isAdmin ? 'QUOTATION CENTER' : 'RESERVATION CENTER'}
                </h2>
                {isAdmin && (
                  <button onClick={() => setIsQuoteModalOpen(true)} className="bg-blue-600 text-white px-5 py-3 rounded-2xl font-black shadow-xl flex items-center gap-2 hover:bg-blue-700 transition-all">
                    <Plus size={18} /> 새 견적서 작성
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {quotes.map(q => {
                  const profit = (q.totalSalesPrice || 0) - (q.totalNetCost || 0);
                  const margin = q.totalSalesPrice ? ((profit / q.totalSalesPrice) * 100).toFixed(1) : 0;
                  const displaySales = getConvertedPrice(q.totalSalesPrice, q.currency, q.exchangeRate);
                  
                  return (
                  <div key={q.id} className="bg-white p-7 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-6 relative">
                      <span className="bg-blue-600 text-white text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest">{q.type}</span>
                      <div className="flex gap-1">
                        {isAdmin && <button onClick={() => openEditQuoteModal(q)} className="text-slate-400 hover:text-indigo-600 p-1.5 bg-slate-50 rounded-lg"><Edit2 size={16} /></button>}
                        <button onClick={() => openReservationModal(q)} className="text-slate-400 hover:text-emerald-600 p-1.5 bg-slate-50 rounded-lg" title="예약 관리"><CheckSquare size={16} /></button>
                        {isAdmin && <button onClick={() => handleDeleteData('quotes', q.id)} className="text-slate-400 hover:text-red-500 p-1.5 bg-slate-50 rounded-lg"><Trash2 size={16} /></button>}
                      </div>
                    </div>
                    <h3 className="font-black text-xl text-slate-900 leading-tight mb-3 line-clamp-1 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setSelectedQuote(q)}>{q.title}</h3>
                    <div className="space-y-2 mb-6 relative">
                      <p className="text-slate-400 text-xs font-bold italic flex items-center gap-2"><Briefcase size={12}/> {q.client} 귀하</p>
                      <p className="text-slate-500 text-xs font-black">{q.pax} PAX / {q.period || 'Schedule TBD'}</p>
                    </div>
                    
                    {isAdmin && (
                      <div className="bg-slate-50 rounded-xl p-3 mb-4 flex justify-between items-center border border-slate-100">
                        <div className="text-xs font-black text-slate-400">MARGIN</div>
                        <div className={`text-sm font-black ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {profit >= 0 ? '+' : ''} {Math.round(profit/10000)}만 VND ({margin}%)
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-50 flex justify-between items-end relative">
                      <div className="text-left">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Total Sales ({q.currency})</p>
                        <p className="text-2xl font-black text-blue-600 tracking-tighter">
                          {q.currency === 'KRW' ? '₩' : q.currency === 'USD' ? '$' : '₫'}
                          {Number(displaySales).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => setSelectedQuote(q)} className="bg-slate-900 text-white w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-blue-600 transition-all shadow-lg" title="손님용 인쇄"><Printer size={20}/></button>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {activeTab === 'schedules' && (
             <div className="max-w-5xl mx-auto flex flex-col h-full animate-in slide-in-from-bottom-2">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-black tracking-tighter uppercase">Operations Hub</h2>
                  <div className="flex gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                    <button onClick={() => setViewMode('calendar')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${viewMode === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>CALENDAR</button>
                    <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>LIST</button>
                  </div>
                </div>
                {viewMode === 'calendar' ? (
                  <div className="bg-white rounded-[32px] border border-slate-200 shadow-xl overflow-hidden flex flex-col flex-1">
                    <div className="p-6 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-black text-xl uppercase">{currentDate.getFullYear()}. {currentDate.getMonth()+1}</h3>
                      <div className="flex gap-2">
                        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}><ChevronLeft/></button>
                        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}><ChevronRight/></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 border-b bg-white">{['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d=><div key={d} className="py-3 text-center text-[10px] font-black text-slate-400">{d}</div>)}</div>
                    <div className="grid grid-cols-7 flex-1 overflow-y-auto bg-slate-50/20">
                      {calendarDays.map((day, idx) => {
                        const dateStr = day ? `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
                        const dayScheds = schedules.filter(s => s.date === dateStr);
                        return (
                          <div key={idx} onClick={() => handleDateClick(day)} className={`min-h-[100px] border-r border-b border-slate-100 p-2 cursor-pointer ${day ? 'hover:bg-blue-50' : ''}`}>
                            {day && <span className="text-xs font-black text-slate-400">{day}</span>}
                            {dayScheds.map(ds => <div key={ds.id} className="text-[9px] bg-emerald-100 text-emerald-800 p-1 rounded mt-1 truncate">{ds.time} {ds.title}</div>)}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {schedules.map(item => (
                      <div key={item.id} className="bg-white border rounded-2xl p-6 flex gap-6 items-center shadow-sm">
                        <div className="text-center w-20"><p className="text-emerald-600 font-bold">{item.date}</p><p className="text-xl font-black">{item.time}</p></div>
                        <div><h4 className="font-bold">{item.title}</h4><p className="text-xs text-slate-400">{item.location}</p></div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          )}
           {activeTab === 'messenger' && (
             <div className="max-w-4xl mx-auto h-full flex flex-col animate-in fade-in">
                <h2 className="text-2xl font-black uppercase mb-6">Messenger</h2>
                <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-xl flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex flex-col ${msg.authorId === user.uid ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] font-bold text-slate-400">{msg.authorName}</span>
                        <div className={`px-4 py-2 rounded-xl text-sm ${msg.authorId === user.uid ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{msg.text}</div>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendMessage} className="p-4 bg-slate-50 flex gap-3">
                    <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} className="flex-1 px-4 py-3 rounded-xl border" placeholder="Message..." />
                    <button type="submit" className="bg-blue-600 text-white p-3 rounded-xl"><Send/></button>
                  </form>
                </div>
             </div>
          )}
        </main>
      </div>

      {/* [MODAL: 예약 관리 (Reservation Management)] */}
      {isReservationModalOpen && reservationQuote && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-sans">
            <div className="p-6 border-b bg-emerald-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2 text-emerald-900">
                  <CheckSquare size={24}/> 예약 관리 / Reservation Status
                </h3>
                <p className="text-xs text-emerald-600 font-bold mt-1">Project: {reservationQuote.title}</p>
              </div>
              <button onClick={() => setIsReservationModalOpen(false)} className="hover:bg-emerald-100 p-2 rounded-full"><X/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-800 text-white font-black uppercase">
                    <tr><th className="p-3 w-16 text-center">Day</th><th className="p-3 w-20">Time</th><th className="p-3 w-24">Type</th><th className="p-3">Description</th><th className="p-3 w-24 text-center">Status</th><th className="p-3 w-48">Voucher</th><th className="p-3 w-24 text-center">Vendor Pay</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reservationQuote.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 text-center font-bold">{item.day}일차</td><td className="p-3 font-bold text-slate-500">{item.time}</td><td className="p-3 font-bold text-blue-600">{item.category}</td><td className="p-3 font-medium">{item.description}</td>
                        <td className="p-3 text-center"><button onClick={() => handleReservationChange(idx, 'reservationStatus', item.reservationStatus === 'Confirmed' ? 'Pending' : 'Confirmed')} className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase ${item.reservationStatus === 'Confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{item.reservationStatus || 'Pending'}</button></td>
                        <td className="p-3"><div className="flex gap-2"><input type="text" placeholder="내용" className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none" value={item.voucher} onChange={(e) => handleReservationChange(idx, 'voucher', e.target.value)} /><button className="text-slate-400 hover:text-blue-600"><FileImage size={16}/></button></div></td>
                        <td className="p-3 text-center"><button onClick={() => handleReservationChange(idx, 'vendorPaid', !item.vendorPaid)} className={`flex items-center justify-center gap-1 w-full py-1.5 rounded-lg font-black text-[10px] uppercase ${item.vendorPaid ? 'bg-blue-100 text-blue-700' : 'bg-red-50 text-red-400'}`}>{item.vendorPaid ? <CheckCircle2 size={12}/> : <CreditCard size={12}/>}{item.vendorPaid ? 'PAID' : 'UNPAID'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-6 border-t bg-white flex justify-end">
              <button onClick={handleSaveReservation} className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-black shadow-xl hover:bg-emerald-700 transition-all uppercase tracking-widest text-sm">Save Reservations</button>
            </div>
          </div>
        </div>
      )}

      {/* [MODAL: 견적서 작성/수정 (Admin)] */}
      {isQuoteModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-sans">
            <div className="p-6 border-b bg-indigo-50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2 text-indigo-900"><Calculator size={24}/> {editingQuoteId ? '견적 수정' : '새 견적 작성'}</h3>
              <button onClick={closeQuoteModal} className="hover:bg-slate-200 p-2 rounded-full"><X/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <input type="text" placeholder="프로젝트명" className="input-field col-span-2" value={newQuote.title} onChange={e => setNewQuote({...newQuote, title: e.target.value})} />
                <input type="text" placeholder="고객명" className="input-field" value={newQuote.client} onChange={e => setNewQuote({...newQuote, client: e.target.value})} />
                
                {/* [UPDATE] 날짜 선택 및 텍스트 자동 입력 필드 */}
                <div className="col-span-1 md:col-span-2 bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex gap-2 mb-2 items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[30px]">Start</span>
                    <input type="date" className="bg-slate-50 border-none rounded-lg px-2 py-1 text-sm font-bold outline-none" value={newQuote.startDate} onChange={e => handleQuoteDateChange('startDate', e.target.value)} />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[30px] ml-2">End</span>
                    <input type="date" className="bg-slate-50 border-none rounded-lg px-2 py-1 text-sm font-bold outline-none" value={newQuote.endDate} onChange={e => handleQuoteDateChange('endDate', e.target.value)} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="일정 텍스트 (예: 2026-02-05 ~ 02-09, 3박 5일)" 
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-bold outline-none" 
                    value={newQuote.period} 
                    onChange={e => setNewQuote({...newQuote, period: e.target.value})} 
                  />
                </div>

                <input type="number" placeholder="인원" className="input-field" value={newQuote.pax} onChange={e => setNewQuote({...newQuote, pax: e.target.value})} />
                
                {/* 통화 설정 */}
                <div className="col-span-1 md:col-span-2 flex gap-2 items-center bg-white p-2 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-lg text-indigo-700 font-black text-[10px] uppercase tracking-wide whitespace-nowrap">
                    <ArrowRightLeft size={14}/> Currency Config
                  </div>
                  <select className="bg-transparent font-bold text-sm outline-none cursor-pointer text-slate-700" value={newQuote.currency} onChange={e => setNewQuote({...newQuote, currency: e.target.value})}>
                    <option value="KRW">KRW (한국 원)</option>
                    <option value="USD">USD (미국 달러)</option>
                    <option value="VND">VND (베트남 동)</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="환율 (1 Target = ? VND)" 
                    className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm font-bold text-right outline-none focus:ring-2 focus:ring-indigo-100" 
                    value={newQuote.exchangeRate} 
                    onChange={e => setNewQuote({...newQuote, exchangeRate: e.target.value})} 
                  />
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">VND / 1 {newQuote.currency}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-6">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-white font-black uppercase">
                    <tr>
                      <th className="p-3 w-10 text-center">D</th>
                      <th className="p-3 w-16">Time</th>
                      <th className="p-3 w-20">Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 w-14 text-center bg-slate-800">Qty</th>
                      <th className="p-3 w-24 bg-red-900/50 text-red-100 text-right">Net(VND)</th>
                      <th className="p-3 w-24 bg-blue-900/50 text-blue-100 text-right">Sale(VND)</th>
                      <th className="p-3 w-24 bg-indigo-900/50 text-indigo-100 text-right">Conv.({newQuote.currency})</th>
                      <th className="p-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quoteItems.map((item, idx) => {
                      const convertedSales = getConvertedPrice(item.salesPrice, newQuote.currency, newQuote.exchangeRate);
                      return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-center"><input type="number" className="w-full text-center bg-transparent font-bold outline-none" value={item.day} onChange={e=>handleItemChange(idx,'day',e.target.value)} /></td>
                        <td className="p-2"><input type="time" className="w-full bg-transparent font-medium outline-none" value={item.time} onChange={e=>handleItemChange(idx,'time',e.target.value)} /></td>
                        <td className="p-2"><select className="w-full bg-transparent font-bold outline-none" value={item.category} onChange={e=>handleItemChange(idx,'category',e.target.value)}><option value="TOUR">일정</option><option value="GOLF">골프</option><option value="HOTEL">숙소</option><option value="MEAL">식사</option><option value="CAR">차량</option></select></td>
                        <td className="p-2"><input type="text" className="w-full bg-transparent font-bold outline-none" placeholder="내용" value={item.description} onChange={e=>handleItemChange(idx,'description',e.target.value)} /></td>
                        <td className="p-2 text-center bg-slate-50"><input type="number" className="w-full text-center bg-transparent font-black outline-none" value={item.qty} onChange={e=>handleItemChange(idx,'qty',e.target.value)} /></td>
                        
                        {/* 원가 (VND) */}
                        <td className="p-2 bg-red-50/20 text-right">
                          <input type="number" className="w-full bg-transparent font-medium text-red-400 text-right outline-none mb-1" placeholder="단가" value={item.netUnit} onChange={e=>handleItemChange(idx,'netUnit',e.target.value)} />
                          <div className="text-[10px] font-black text-red-600">{Number(item.netCost).toLocaleString()}</div>
                        </td>
                        
                        {/* 판매가 (VND) */}
                        <td className="p-2 bg-blue-50/20 text-right">
                          <input type="number" className="w-full bg-transparent font-medium text-blue-400 text-right outline-none mb-1" placeholder="단가" value={item.salesUnit} onChange={e=>handleItemChange(idx,'salesUnit',e.target.value)} />
                          <div className="text-[10px] font-black text-blue-600">{Number(item.salesPrice).toLocaleString()}</div>
                        </td>

                        {/* 자동 환산 미리보기 */}
                        <td className="p-2 bg-indigo-50/20 text-right font-black text-indigo-600 text-xs">
                          {Number(convertedSales).toLocaleString()}
                        </td>
                        
                        <td className="p-2 text-center"><button onClick={() => removeQuoteItem(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button></td>
                      </tr>
                    )})}
                  </tbody>
                  <tfoot className="bg-slate-50 font-black">
                    <tr>
                       <td colSpan="5" className="p-3 text-right text-slate-500 uppercase tracking-widest">Total Summary</td>
                       <td className="p-3 text-right text-red-600">₫{newQuote.totalNetCost.toLocaleString()}</td>
                       <td className="p-3 text-right text-blue-600">₫{newQuote.totalSalesPrice.toLocaleString()}</td>
                       <td className="p-3 text-right text-indigo-600 text-sm border-l-2 border-indigo-100">
                         {newQuote.currency === 'KRW' ? '₩' : '$'}{Number(getConvertedPrice(newQuote.totalSalesPrice, newQuote.currency, newQuote.exchangeRate)).toLocaleString()}
                       </td>
                       <td></td>
                    </tr>
                  </tfoot>
                </table>
                <div className="p-2 bg-slate-50 border-t border-slate-100"><button onClick={addQuoteItem} className="w-full py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 font-bold hover:bg-white hover:border-blue-400 hover:text-blue-500 transition-all flex items-center justify-center gap-2"><Plus size={16}/> 행 추가</button></div>
              </div>
            </div>
            <div className="p-6 border-t bg-white flex justify-end gap-4 shrink-0"><button onClick={handleSaveQuote} className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-black shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-sm">{editingQuoteId ? '수정 완료' : '견적 저장'}</button></div>
          </div>
        </div>
      )}

      {/* [MODAL: 인쇄 (Client View) - 통화 적용] */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-lg z-50 flex items-center justify-center p-4 overflow-y-auto no-print">
           <div className="bg-white w-full max-w-4xl min-h-[1000px] shadow-2xl rounded-sm p-16 relative animate-in zoom-in-95 duration-300 text-slate-900 font-serif">
            <div className="absolute top-8 right-8 flex gap-4 no-print">
              <button onClick={() => window.print()} className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest"><Printer size={18} /> 인쇄 ({selectedQuote.currency})</button>
              <button onClick={() => setSelectedQuote(null)} className="p-4 bg-slate-100 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-md"><X size={24} /></button>
            </div>
            <div className="text-center mb-12"><h2 className="text-5xl font-black underline underline-offset-[12px] decoration-[4px] tracking-[10px] uppercase">QUOTATION</h2></div>
            <div className="grid grid-cols-2 gap-12 mb-10 p-8 border-2 border-slate-100 bg-slate-50/50 rounded-2xl">
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b pb-2"><span className="font-black text-slate-400 uppercase w-24">Customer</span> <span className="font-bold">{selectedQuote.client} 귀하</span></div>
                <div className="flex justify-between border-b pb-2"><span className="font-black text-slate-400 uppercase w-24">Period</span> <span className="font-bold">{selectedQuote.period}</span></div>
                <div className="flex justify-between border-b pb-2"><span className="font-black text-slate-400 uppercase w-24">Pax</span> <span className="font-bold">{selectedQuote.pax} 명</span></div>
              </div>
              <div className="text-right flex flex-col justify-end">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Amount ({selectedQuote.currency})</p>
                <p className="text-4xl font-black text-blue-800 tracking-tighter">
                  {selectedQuote.currency === 'KRW' ? '₩' : '$'}
                  {Number(getConvertedPrice(selectedQuote.totalSalesPrice, selectedQuote.currency, selectedQuote.exchangeRate)).toLocaleString()}
                </p>
                <p className="text-xs text-slate-400 italic font-bold mt-2">1 {selectedQuote.currency} = {selectedQuote.exchangeRate} VND</p>
              </div>
            </div>
            <table className="w-full border-collapse border border-slate-300 text-[12px] mb-12">
              <thead className="bg-slate-900 text-white font-black uppercase">
                <tr><th className="border border-slate-300 p-3 w-16">Day</th><th className="border border-slate-300 p-3 w-20">Time</th><th className="border border-slate-300 p-3 w-24">Type</th><th className="border border-slate-300 p-3">Description</th><th className="border border-slate-300 p-3 w-16">Qty</th></tr>
              </thead>
              <tbody className="text-center font-bold text-slate-700">
                {(selectedQuote.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 p-3 bg-slate-50">{item.day}일차</td><td className="border border-slate-300 p-3">{item.time}</td><td className="border border-slate-300 p-3 text-slate-500 text-[10px]">{item.category}</td><td className="border border-slate-300 p-3 text-left pl-4">{item.description}</td><td className="border border-slate-300 p-3">{item.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 일정 예약 모달 */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b bg-emerald-50/50 flex justify-between items-center">
              <div><h3 className="text-xl font-black uppercase tracking-widest leading-none">Add Schedule</h3><p className="text-[10px] font-bold text-emerald-600 uppercase mt-1">Lịch trình</p></div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="hover:bg-slate-100 p-2 rounded-full transition-all"><X/></button>
            </div>
            <div className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-4"><input type="date" className="input-field" value={newSchedule.date} onChange={e => setNewSchedule({...newSchedule, date: e.target.value})} /><input type="time" className="input-field" value={newSchedule.time} onChange={e => setNewSchedule({...newSchedule, time: e.target.value})} /></div>
              <input type="text" placeholder="Title" className="input-field" value={newSchedule.title} onChange={e => setNewSchedule({...newSchedule, title: e.target.value})} /><input type="text" placeholder="Location" className="input-field" value={newSchedule.location} onChange={e => setNewSchedule({...newSchedule, location: e.target.value})} />
              <button onClick={handleAddSchedule} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black shadow-xl uppercase tracking-[4px] text-xs hover:bg-emerald-700 transition-all active:scale-95">Save Schedule</button>
            </div>
          </div>
        </div>
      )}

      {/* 스타일 */}
      <style dangerouslySetInnerHTML={{ __html: `
        .nav-btn { @apply flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 text-slate-400 hover:bg-slate-50 hover:text-slate-900; }
        .nav-btn.active { @apply bg-blue-600 text-white font-black shadow-xl shadow-blue-200; }
        .input-field { @apply w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .fixed { position: absolute !important; inset: 0 !important; }
          .bg-slate-900 { background-color: #0f172a !important; color: white !important; -webkit-print-color-adjust: exact; }
          .bg-slate-50 { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }
        }
      `}} />
    </div>
  );
};

export default App;