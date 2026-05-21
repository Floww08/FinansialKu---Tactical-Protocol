"use client";

import { useEffect, useState, useRef } from "react";
import { auth, db } from "@/lib/firebase"; 
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Chart from 'chart.js/auto';
import Tesseract from 'tesseract.js';
import "./dashboard.css"; 

const DEFAULT_DATA = {
    transactions: [],
    budgets: [
        { category: "Kebutuhan Pokok", target: 1500000, color: '#00f0ff' },
        { category: "Transportasi", target: 500000, color: '#ff9100' },
        { category: "Tagihan", target: 800000, color: '#ff2a2a' }
    ],
    goals: [],
    portfolios: []
};

export default function DashboardPage() {
    const [user, setUser] = useState(null);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [activeTab, setActiveTab] = useState("income");
    const [activeView, setActiveView] = useState("dashboard-view");
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isIntelOpen, setIsIntelOpen] = useState(false);
    const [txFilter, setTxFilter] = useState("all");

    const [transactions, setTransactions] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [goals, setGoals] = useState([]);
    const [portfolios, setPortfolios] = useState([]);
    
    const [livePrices, setLivePrices] = useState({});
    const [idrRate, setIdrRate] = useState(15800);
    const [isFetchingMarket, setIsFetchingMarket] = useState(false);

    const [txAmount, setTxAmount] = useState("");
    const [txCategory, setTxCategory] = useState("");
    const [txDesc, setTxDesc] = useState("");
    const [txDate, setTxDate] = useState("");
    
    const [aiInput, setAiInput] = useState("");
    const [isOpticScanning, setIsOpticScanning] = useState(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [newBudgetCat, setNewBudgetCat] = useState("");
    const [newBudgetTarget, setNewBudgetTarget] = useState("");

    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [newGoalName, setNewGoalName] = useState("");
    const [newGoalTarget, setNewGoalTarget] = useState("");

    const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");

    const [portoType, setPortoType] = useState("crypto");
    const [portoSymbol, setPortoSymbol] = useState("");
    const [portoQty, setPortoQty] = useState("");
    const [portoBuy, setPortoBuy] = useState("");

    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: "", onConfirm: null });

    const budgetChartRef = useRef(null);
    const assetChartRef = useRef(null);
    const budgetChartInstance = useRef(null);
    const assetChartInstance = useRef(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                await loadData(currentUser.uid);
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                setTxDate(now.toISOString().slice(0, 16));
            } else {
                window.location.href = "/";
            }
        });
        return () => unsubscribe();
    }, []);

    const loadData = async (uid) => {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            setTransactions(data.transactions || []);
            setBudgets(data.budgets || DEFAULT_DATA.budgets);
            setGoals(data.goals || []);
            setPortfolios(data.portfolios || []);
        } else {
            setBudgets(DEFAULT_DATA.budgets);
            await setDoc(docRef, DEFAULT_DATA);
        }
        setIsDataLoaded(true);
    };

    const syncDataToFirebase = async (newTx, newBudgets, newGoals, newPortos) => {
        if (!user) return;
        const payload = {
            transactions: newTx || transactions,
            budgets: newBudgets || budgets,
            goals: newGoals || goals,
            portfolios: newPortos || portfolios
        };
        await setDoc(doc(db, "users", user.uid), payload);
    };

    const handleUpdateUsername = async (e) => {
        e.preventDefault();
        if (!newUsername.trim()) return;
        try {
            await updateProfile(auth.currentUser, { displayName: newUsername });
            setUser({ ...auth.currentUser, displayName: newUsername });
            setIsUsernameModalOpen(false);
        } catch (error) {
            alert("Gagal memperbarui username.");
        }
    };

    useEffect(() => {
        let interval;
        const fetchMarketData = async () => {
            if (portfolios.length === 0) return;
            setIsFetchingMarket(true);
            try {
                let currentIdrRate = idrRate;
                try {
                    const rateReq = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
                    const rateData = await rateReq.json();
                    currentIdrRate = rateData.rates.IDR;
                    setIdrRate(currentIdrRate);
                } catch (e) {}

                const newPrices = { ...livePrices };
                for (let asset of portfolios) {
                    let sym = asset.symbol.toUpperCase();
                    try {
                        if (asset.type === "crypto") {
                            if (!sym.includes("USDT")) sym += "USDT";
                            const req = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
                            if (req.ok) {
                                const data = await req.json();
                                newPrices[asset.symbol] = parseFloat(data.price) * currentIdrRate;
                            }
                        } else {
                            if (!sym.endsWith('.JK')) sym += ".JK";
                            const req = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/' + sym)}`);
                            if (req.ok) {
                                const data = await req.json();
                                const contents = JSON.parse(data.contents);
                                if (contents.chart.result) {
                                    newPrices[asset.symbol] = parseFloat(contents.chart.result[0].meta.regularMarketPrice) * 100; 
                                }
                            }
                        }
                    } catch (e) {}
                }
                setLivePrices(newPrices);
            } catch (err) {}
            setIsFetchingMarket(false);
        };

        if (activeView === 'portfolio-view') {
            fetchMarketData();
            interval = setInterval(fetchMarketData, 60000); 
        }
        return () => clearInterval(interval);
    }, [portfolios, activeView]);

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
    const activeBalance = totalIncome - totalExpense;
    const healthRate = totalIncome > 0 ? ((activeBalance / totalIncome) * 100).toFixed(1) : 0;
    const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);

    const incomeCategories = ["Pemasukan Gaji", "Pencairan Aset", "Pendapatan Sampingan", "Lain-lain"];
    const currentCategories = activeTab === 'income' ? incomeCategories : budgets.map(b => b.category);

    let totalAssetValuation = 0, totalAssetModal = 0, allocCrypto = 0, allocSaham = 0;
    portfolios.forEach(a => {
        const currentPrice = livePrices[a.symbol] || (a.buy / a.qty);
        const val = currentPrice * a.qty;
        totalAssetValuation += val; totalAssetModal += a.buy;
        if (a.type === 'crypto') allocCrypto += val; else allocSaham += val;
    });
    const netProfitLoss = totalAssetValuation - totalAssetModal;

    useEffect(() => {
        if (activeView === 'dashboard-view' && budgetChartRef.current && isDataLoaded) {
            if (budgetChartInstance.current) budgetChartInstance.current.destroy();
            const activeBudgets = budgets.map(b => {
                const used = transactions.filter(t => t.type === 'expense' && t.category === b.category).reduce((acc, curr) => acc + curr.amount, 0);
                return { ...b, used };
            }).filter(b => b.target > 0 || b.used > 0);

            budgetChartInstance.current = new Chart(budgetChartRef.current, {
                type: 'doughnut',
                data: { labels: activeBudgets.map(b => b.category), datasets: [{ data: activeBudgets.map(b => b.used), backgroundColor: activeBudgets.map(b => b.color), borderWidth: 2, borderColor: '#0b0c10', hoverOffset: 5 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'right', labels: { color: '#8b949e', usePointStyle: true, padding: 15, font: { family: "'Plus Jakarta Sans'", size: 11, weight: 'bold' } } } } }
            });
        }
        return () => { if (budgetChartInstance.current) budgetChartInstance.current.destroy(); }
    }, [transactions, budgets, activeView, isDataLoaded]);

    useEffect(() => {
        if (activeView === 'portfolio-view' && assetChartRef.current && isDataLoaded) {
            if (assetChartInstance.current) assetChartInstance.current.destroy();
            assetChartInstance.current = new Chart(assetChartRef.current, {
                type: 'pie',
                data: { labels: ['Aset Kripto', 'Aset Saham'], datasets: [{ data: [allocCrypto, allocSaham], backgroundColor: ['#ff9100', '#00f0ff'], borderWidth: 2, borderColor: '#0b0c10', hoverOffset: 5 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 10, color: '#8b949e', font: { weight: 'bold', size: 10, family: "'Plus Jakarta Sans'" } } } } }
            });
        }
        return () => { if (assetChartInstance.current) assetChartInstance.current.destroy(); }
    }, [allocCrypto, allocSaham, activeView, isDataLoaded]);

    const extractTransactionData = (rawText) => {
        let amount = 0;
        let type = "expense";
        let cat = "Lain-lain";

        const cleanText = rawText.toLowerCase().replace(/rp\s?/g, '').replace(/,/g, '.');

        const isReceipt = /total|tunai|kembali|struk|nota|kasir|pajak|change|cash/i.test(cleanText);

        const allNumbers = [...cleanText.matchAll(/(?<!\d)(\d{1,3}(?:\.\d{3})+)(?!\d)|(?<!\d)(\d{4,})(?!\d)/g)]
            .map(m => parseInt((m[1] || m[2]).replace(/\./g, '')))
            .filter(n => !isNaN(n) && n > 0);

        if (isReceipt) {
            type = 'expense'; 
            const totalMatch = cleanText.match(/(?:total|jumlah|grand total|subtotal)[\s\S]{0,20}?(\d{1,3}(?:\.\d{3})+|\d{4,})/i);
            
            if (totalMatch) {
                amount = parseInt(totalMatch[1].replace(/\./g, ''));
            } 
            else if (allNumbers.length > 0) {
                const sorted = allNumbers.sort((a,b) => b-a);
                if (cleanText.includes('kembali') && sorted.length >= 2) {
                    amount = sorted[1]; 
                } else {
                    amount = sorted[0]; 
                }
            }
        } else {
            const regexJt = /(?<!\d)(\d+(?:\.\d+)?)\s*(jt|juta|m)\b/i;  
            const regexK = /(?<!\d)(\d+(?:\.\d+)?)\s*(k|rb|ribu)\b/i;   

            if (regexJt.test(cleanText)) {
                amount = parseFloat(cleanText.match(regexJt)[1]) * 1000000;
            } else if (regexK.test(cleanText)) {
                amount = parseFloat(cleanText.match(regexK)[1]) * 1000;
            } else if (allNumbers.length > 0) {
                amount = allNumbers[0]; 
            }

            const isIncome = /gaji|masuk|terima|profit|cair|topup|dapat|saku|jual|tarik/i.test(cleanText);
            if (isIncome && !/bayar|beli|keluar|potong/i.test(cleanText)) {
                type = 'income';
            }
        }

        if (type === 'income') {
            if (/emas|crypto|saham|aset|bitcoin|btc/i.test(cleanText)) cat = "Pencairan Aset";
            else cat = incomeCategories[0] || "Lain-lain";
        } else {
            if (/makan|minum|kopi|rokok|bensin|gojek|grab|indomaret|alfamart|superindo|warteg|resto|struk|nota|total/i.test(cleanText)) {
                cat = budgets.find(b => /pokok|makan|harian/i.test(b.category))?.category || budgets[0]?.category;
            } else if (/listrik|air|wifi|internet|token|pajak|pln|pdam/i.test(cleanText)) {
                cat = budgets.find(b => /tagihan|bulanan/i.test(b.category))?.category || budgets[2]?.category;
            } else if (/kereta|tiket|pesawat|bus|tol|parkir/i.test(cleanText)) {
                cat = budgets.find(b => /transportasi|jalan/i.test(b.category))?.category || budgets[1]?.category;
            } else {
                cat = budgets[0]?.category || "Pengeluaran";
            }
        }

        return { amount, type, category: cat };
    };

    const handleAIProcessing = async (e) => {
        if (e) e.preventDefault();
        if (!aiInput) return;
        
        const extracted = extractTransactionData(aiInput);
        if (extracted.amount <= 0) return alert('Gagal membaca nominal angka. Coba ketik lebih jelas atau foto ulang.');

        let desc = aiInput.length > 30 ? aiInput.substring(0, 30) + '...' : aiInput;
        desc = '[AI] ' + desc.replace(/\n/g, ' ');

        const newTx = [{ id: Date.now(), type: extracted.type, amount: extracted.amount, category: extracted.category, description: desc, date: new Date().toISOString() }, ...transactions];
        setTransactions(newTx);
        setAiInput("");
        await syncDataToFirebase(newTx, null, null, null);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAIProcessing(e);
        }
    };

    // PROSES GAMBAR DIPISAH: isCamera (fisik) vs isFile (digital)
    const handleOpticScan = async (e, isCamera = false) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsOpticScanning(true);
        try {
            const processedImageURL = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    // Perbesar resolusi 2x lipat agar teks kecil di screenshot terbaca jelas
                    const scale = 2;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;

                    for (let i = 0; i < data.length; i += 4) {
                        // Ubah ke Grayscale murni
                        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                        
                        if (isCamera) {
                            // Jika difoto dari kamera HP (kertas nota), gunakan efek hitam putih keras
                            const threshold = gray < 130 ? 0 : 255; 
                            data[i] = data[i+1] = data[i+2] = threshold;
                        } else {
                            // Jika di-upload dari file (screenshot), cukup grayscale. Jangan pakai efek keras
                            // agar pinggiran font digital tidak rusak.
                            data[i] = data[i+1] = data[i+2] = gray;
                        }
                    }
                    ctx.putImageData(imageData, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.src = URL.createObjectURL(file);
            });

            const result = await Tesseract.recognize(processedImageURL, 'ind+eng');
            setAiInput(result.data.text.trim()); 
        } catch (error) {
            alert("Scanner gagal membaca gambar.");
        }
        setIsOpticScanning(false);
        e.target.value = ""; 
    };

    const handleAddTransaction = async (e) => {
        e.preventDefault();
        const amount = parseFloat(txAmount);
        if (amount <= 0 || !txCategory || !txDesc) return;
        const newTx = [{ id: Date.now(), type: activeTab, amount, category: txCategory, description: txDesc, date: txDate }, ...transactions];
        setTransactions(newTx);
        setTxAmount(""); setTxDesc("");
        await syncDataToFirebase(newTx, null, null, null);
    };

    const handleDeleteTx = (id) => {
        setConfirmDialog({ isOpen: true, message: "Hapus mutasi ini selamanya?", onConfirm: async () => { const newTx = transactions.filter(t => t.id !== id); setTransactions(newTx); await syncDataToFirebase(newTx, null, null, null); setConfirmDialog({ isOpen: false, message: "", onConfirm: null }); } });
    };

    const handleAddBudget = async () => {
        if (!newBudgetCat || !newBudgetTarget) return;
        const colors = ['#00f0ff', '#ff2a2a', '#ff9100', '#10b981', '#bf00ff', '#e0e0e0'];
        const newB = [...budgets, { category: newBudgetCat, target: parseInt(newBudgetTarget), color: colors[Math.floor(Math.random() * colors.length)] }];
        setBudgets(newB); setNewBudgetCat(""); setNewBudgetTarget(""); await syncDataToFirebase(null, newB, null, null);
    };

    const handleDeleteBudget = (categoryName) => {
        setConfirmDialog({ isOpen: true, message: `Hapus limit untuk kategori '${categoryName}'?`, onConfirm: async () => { const newB = budgets.filter(b => b.category !== categoryName); setBudgets(newB); await syncDataToFirebase(null, newB, null, null); setConfirmDialog({ isOpen: false, message: "", onConfirm: null }); } });
    };

    const handleAddGoal = async (e) => {
        e.preventDefault(); const newG = [...goals, { id: Date.now(), name: newGoalName, target: parseFloat(newGoalTarget), saved: 0 }]; setGoals(newG); setNewGoalName(""); setNewGoalTarget(""); setIsGoalModalOpen(false); await syncDataToFirebase(null, null, newG, null);
    };

    const handleDeleteGoal = (id) => {
        setConfirmDialog({ isOpen: true, message: "Hapus target ini dari sistem?", onConfirm: async () => { const newG = goals.filter(g => g.id !== id); setGoals(newG); await syncDataToFirebase(null, null, newG, null); setConfirmDialog({ isOpen: false, message: "", onConfirm: null }); } });
    };

    const injectGoalFund = async (id, name) => {
        const input = window.prompt(`Masukkan jumlah dana injeksi untuk [${name}]:`, "0");
        if (input) { const val = parseFloat(input); if (val > 0) { const newG = goals.map(g => g.id === id ? { ...g, saved: g.saved + val } : g); setGoals(newG); await syncDataToFirebase(null, null, newG, null); } }
    };

    const handleAddPortfolio = async (e) => {
        e.preventDefault(); const newPortos = [...portfolios, { id: Date.now(), type: portoType, symbol: portoSymbol.toUpperCase(), qty: parseFloat(portoQty), buy: parseFloat(portoBuy) }]; setPortfolios(newPortos); setPortoSymbol(""); setPortoQty(""); setPortoBuy(""); await syncDataToFirebase(null, null, null, newPortos);
    };

    const handleDeletePortfolio = (id) => {
        setConfirmDialog({ isOpen: true, message: "Putuskan sambungan radar untuk aset ini?", onConfirm: async () => { const newPortos = portfolios.filter(p => p.id !== id); setPortfolios(newPortos); await syncDataToFirebase(null, null, null, newPortos); setConfirmDialog({ isOpen: false, message: "", onConfirm: null }); } });
    };

    if (!user || !isDataLoaded) {
        return <div className="dashboard-body flex items-center justify-center"><div className="text-blue font-mono text-xl blink-text font-bold uppercase">&gt; INITIALIZING...</div></div>;
    }

    return (
        <div className="dashboard-body">
            <div className="fluid-bg"></div>

            <div className="app-container">
                <aside className={`sidebar glass-card ${isSidebarOpen ? 'open' : 'slide-right'}`} id="main-sidebar">
                    <button className="btn-icon-round bg-rose text-white mobile-only absolute-tr" onClick={() => setIsSidebarOpen(false)}>
                        <i className="fas fa-times"></i>
                    </button>
                    <div className="brand">
                        <div className="brand-logo"><i className="fas fa-crosshairs"></i></div>
                        <div className="brand-text"><h1>FINANSIAKU</h1><span className="sys-status">SYS.SYNC_ONLINE</span></div>
                    </div>
                    <ul className="nav-menu">
                        <li className="nav-label">COMMAND CENTER</li>
                        <li><button onClick={() => { setActiveView("dashboard-view"); setIsSidebarOpen(false); }} className={`w-full text-left nav-item ${activeView === "dashboard-view" ? "active" : ""}`}><i className="fas fa-desktop"></i> Main Radar</button></li>
                        <li><button onClick={() => { setActiveView("portfolio-view"); setIsSidebarOpen(false); }} className={`w-full text-left nav-item ${activeView === "portfolio-view" ? "active" : ""}`}><i className="fas fa-satellite"></i> Asset Link <span className="badge bg-mint text-dark">LIVE</span></button></li>
                    </ul>
                    <div className="budget-panel">
                        <div className="panel-header d-flex justify-between align-center mb-2 border-b pb-2">
                            <span className="nav-label m-0 border-0">PROTOCOL LIMIT</span>
                            <button onClick={() => setIsBudgetModalOpen(true)} className="btn-icon-round text-muted hover-bg-blue border-0"><i className="fas fa-sliders-h"></i></button>
                        </div>
                        <ul className="scroll-y p-0 mt-2">
                            {budgets.map((b, i) => {
                                const used = transactions.filter(t => t.type === 'expense' && t.category === b.category).reduce((acc, curr) => acc + curr.amount, 0);
                                const isOver = b.target > 0 && used > b.target;
                                const color = isOver ? 'var(--rose)' : b.color;
                                const pct = b.target === 0 ? 0 : Math.min((used / b.target) * 100, 100);
                                return (
                                    <li key={i} className="budget-list-item" style={{ borderLeftColor: color }}>
                                        <div className="b-info d-flex flex-col gap-1 mb-2">
                                            <span style={{ color: color }} className="font-bold text-sm uppercase word-break">{b.category}</span> 
                                            <div className="d-flex justify-between font-mono text-xs w-full">
                                                <span style={{ color: color }}>{formatRp(used)}</span> 
                                                <span className="text-muted">/ {b.target === 0 ? 'UNLIMITED' : formatRp(b.target)}</span>
                                            </div>
                                        </div>
                                        <div className="progress-bg"><div className="progress-bar" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}` }}></div></div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    <div className="sidebar-bottom mt-3 pt-3 border-t">
                        <button onClick={() => setConfirmDialog({ isOpen: true, message: "Keluar dari sistem?", onConfirm: () => signOut(auth) })} className="btn-action text-rose mt-2 hover-bg-rose hover-float">
                            <i className="fas fa-power-off mr-2"></i> LOGOUT
                        </button>
                    </div>
                </aside>

                <main className="workspace fade-in">
                    <header className="header mb-4 d-flex justify-between align-center flex-wrap gap-3 stagger-1">
                        <div className="d-flex align-center gap-3">
                            <button className="btn-icon-round bg-glass text-blue mobile-only hover-float" onClick={() => setIsSidebarOpen(true)}><i className="fas fa-bars"></i></button>
                            <div className="text-container">
                                <h2 className="mb-1 text-white uppercase font-bold text-xl d-flex align-center gap-2">
                                    User: {user.displayName || user.email.split('@')[0]}
                                    <button onClick={() => { setNewUsername(user.displayName || ""); setIsUsernameModalOpen(true); }} className="btn-icon-small text-blue border-0 hover-bg-blue" style={{ width: '24px', height: '24px', fontSize: '12px' }}>
                                        <i className="fas fa-pen"></i>
                                    </button>
                                </h2>
                                <p className="text-blue text-sm font-mono uppercase font-bold">&gt; UID: {user.uid.slice(0,8)}...</p>
                            </div>
                        </div>
                        <div className="d-flex align-center gap-3">
                            <button onClick={() => setConfirmDialog({ isOpen: true, message: "Keluar dari sistem?", onConfirm: () => signOut(auth) })} className="btn-icon-round bg-rose text-white hover-float hide-on-mobile"><i className="fas fa-power-off"></i></button>
                        </div>
                    </header>

                    {activeView === "dashboard-view" && (
                        <div className="view-panel active">
                            <div className="grid-stats stagger-2">
                                <div className="glass-card balance-card hover-float">
                                    <div className="d-flex justify-between align-center mb-4"><p className="stat-label text-blue">ACTIVE BALANCE</p><div className="icon-box text-blue"><i className="fas fa-hdd"></i></div></div>
                                    <h2 className="text-white text-4xl font-bold font-mono drop-shadow-blue">{formatRp(activeBalance)}</h2>
                                </div>
                                <div className="glass-card hover-float">
                                    <div className="d-flex justify-between align-center mb-4"><p className="stat-label">INCOMING FUNDS</p><div className="icon-box text-blue border-blue"><i className="fas fa-level-down-alt"></i></div></div>
                                    <h3 className="text-white text-2xl font-bold font-mono">{formatRp(totalIncome)}</h3>
                                </div>
                                <div className="glass-card hover-float">
                                    <div className="d-flex justify-between align-center mb-4"><p className="stat-label">FUNDS DEPLOYED</p><div className="icon-box text-rose border-rose"><i className="fas fa-level-up-alt"></i></div></div>
                                    <h3 className="text-white text-2xl font-bold font-mono">{formatRp(totalExpense)}</h3>
                                </div>
                            </div>

                            <div className="grid-2 gap-4 mt-4 stagger-3 mobile-grid-1">
                                <div className="glass-card d-flex align-center justify-between hover-float">
                                    <div><h3 className="title-md text-white mb-1"><i className="fas fa-shield-alt text-blue mr-2"></i> System Health</h3><p className="text-xs text-muted uppercase">Retention Capacity Rate.</p></div>
                                    <div className="radial-progress">
                                        <svg viewBox="0 0 100 100">
                                            <circle className="bg-circle" cx="50" cy="50" r="40"></circle>
                                            <circle className="progress-circle" cx="50" cy="50" r="40" style={{ strokeDashoffset: 251.2 - (251.2 * (healthRate / 100)), stroke: healthRate >= 20 ? 'var(--blue)' : 'var(--rose)' }}></circle>
                                        </svg>
                                        <span className={`progress-text ${healthRate >= 20 ? 'text-blue' : 'text-rose blink-text'}`}>{healthRate}%</span>
                                    </div>
                                </div>
                                <div className="glass-card d-flex flex-col justify-center hover-float relative overflow-hidden">
                                    <div className="insight-bg-glow"></div><h3 className="title-md text-white mb-2"><i className="fas fa-microchip text-yellow mr-2"></i> AI Tactical Insight</h3><p className="text-xs text-muted mb-2 uppercase">Burn Rate (Daily Average):</p>
                                    <h2 className="text-yellow text-2xl font-bold font-mono mb-1">{formatRp(totalExpense / (new Date().getDate() || 1))} / Hari</h2>
                                    <p className={`text-xs uppercase font-bold ${healthRate >= 20 ? 'text-blue' : 'text-rose blink-text'}`}>&gt; {healthRate >= 20 ? 'SYSTEM STABLE. EXPENSES OPTIMAL.' : 'WARNING: CRITICAL RETENTION.'}</p>
                                </div>
                            </div>

                            <div className="grid-main mt-4 stagger-4 mobile-grid-1">
                                <div className="glass-card flex-col">
                                    <div className="tabs mb-4">
                                        <button type="button" onClick={() => { setActiveTab("income"); setTxCategory(incomeCategories[0]); }} className={`tab-btn font-mono font-bold ${activeTab === "income" ? "active" : ""}`}>INJECT (+)</button>
                                        <button type="button" onClick={() => { setActiveTab("expense"); setTxCategory(budgets[0]?.category || ""); }} className={`tab-btn font-mono font-bold ${activeTab === "expense" ? "active" : ""}`}>DEPLOY (-)</button>
                                    </div>
                                    <form onSubmit={handleAddTransaction} className="flex-col gap-1">
                                        <div className="form-group"><label>TRANSFER AMOUNT (IDR)</label><input type="number" required placeholder="0" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} className="input-lg font-bold text-white font-mono" /></div>
                                        <div className="grid-2 gap-3 mb-3 mt-3 mobile-grid-1">
                                            <div className="form-group">
                                                <label>CLASS / TYPE</label>
                                                <select value={txCategory} onChange={(e) => setTxCategory(e.target.value)} required className="w-full p-3 bg-black text-white font-bold font-mono border border-gray-700 rounded" style={{ height: '48px' }}>
                                                    <option value="" disabled>Pilih Kategori</option>{currentCategories.map((c, i) => <option key={i} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group"><label>LOG DETAIL</label><input type="text" required placeholder="Input Log..." value={txDesc} onChange={(e) => setTxDesc(e.target.value)} autoComplete="off" /></div>
                                        </div>
                                        <div className="form-group"><label>TIMESTAMP</label><input type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)} required /></div>
                                        <button type="submit" className={`btn-main mt-4 w-full hover-float font-mono text-lg font-bold ${activeTab === "income" ? "bg-gradient-blue" : "bg-rose"}`}>EXECUTE TRANSFER</button>
                                    </form>
                                </div>
                                <div className="glass-card flex-col">
                                    <h3 className="title-md mb-4 text-white"><i className="fas fa-radar mr-2 text-blue"></i> DEPLOYMENT MAP</h3>
                                    <div className="chart-container flex-1 relative d-flex align-center justify-center font-mono text-muted"><canvas ref={budgetChartRef}></canvas></div>
                                </div>
                            </div>

                            <div className="glass-card mt-4 p-0 stagger-5 overflow-visible">
                                <div className="p-4 border-b d-flex justify-between align-center flex-wrap gap-3">
                                    <h3 className="title-md text-white"><i className="fas fa-database mr-2 text-blue"></i> DATABASE LOGS</h3>
                                    <div className="custom-select-wrapper w-auto min-w-150">
                                        <select className="bg-black text-white p-2 border border-gray-700 font-mono text-xs uppercase rounded" value={txFilter} onChange={(e) => setTxFilter(e.target.value)}>
                                            <option value="all">SEMUA DATA</option><option value="income">INJECT ONLY</option><option value="expense">DEPLOY ONLY</option>
                                        </select>
                                    </div>
                                </div>
                                <ul className="data-list p-3 max-h-400 scroll-y">
                                    {transactions.filter(t => txFilter === "all" || t.type === txFilter).map((tx) => (
                                        <li key={tx.id} style={{ borderLeft: `3px solid ${tx.type === 'income' ? 'var(--blue)' : 'var(--rose)'}`}}>
                                            <div>
                                                <div className="d-flex align-center"><span className="text-muted mr-2 text-xs font-mono"><i className="fas fa-crosshairs mr-1 text-blue"></i> {new Date(tx.date).toLocaleString('id-ID')}</span> <span className="text-muted font-bold text-xs uppercase">{tx.category}</span></div>
                                                <div className="tx-title mt-1 uppercase text-sm">{tx.description}</div>
                                            </div>
                                            <div className="d-flex align-center">
                                                <h3 className={`font-mono font-bold text-lg ${tx.type === 'income' ? 'text-blue' : 'text-rose'}`}>{tx.type === 'income' ? '+' : '-'} {formatRp(tx.amount)}</h3>
                                                <button onClick={() => handleDeleteTx(tx.id)} className="btn-icon-small border-0 hover-bg-rose ml-3 text-muted"><i className="fas fa-trash-alt"></i></button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {activeView === "portfolio-view" && (
                        <div className="view-panel active">
                            <div className="grid-main mobile-grid-1" style={{ marginTop: 0, marginBottom: '24px' }}>
                                <div className="d-flex flex-col gap-4">
                                    <div className="glass-card balance-card h-full d-flex flex-col justify-center hover-float">
                                        <div className="d-flex justify-between align-center mb-3"><p className="stat-label text-blue">TOTAL ASSET VALUATION</p></div>
                                        <h2 className="text-white text-4xl font-bold font-mono drop-shadow-blue">{formatRp(totalAssetValuation)}</h2>
                                    </div>
                                    <div className="glass-card h-full d-flex flex-col justify-center hover-float">
                                        <div className="d-flex justify-between align-center mb-2"><p className="stat-label">NET PROFIT / LOSS</p></div>
                                        <h3 className={`text-3xl font-bold font-mono ${netProfitLoss >= 0 ? 'text-blue' : 'text-rose blink-text'}`}>{netProfitLoss >= 0 ? '+ ' : '- '}{formatRp(Math.abs(netProfitLoss))}</h3>
                                    </div>
                                </div>
                                <div className="glass-card flex-col align-center justify-center hover-float">
                                    <h3 className="title-md mb-2 w-full text-center text-white">ASSET DISTRIBUTION</h3>
                                    <div className="chart-container" style={{ position: 'relative', width: '100%', height: '200px' }}><canvas ref={assetChartRef}></canvas></div>
                                </div>
                            </div>
                            <div className="glass-card mb-4 overflow-visible">
                                <h3 className="title-md mb-4 text-white"><i className="fas fa-link mr-2 text-yellow"></i> ESTABLISH NEW LINK</h3>
                                <form onSubmit={handleAddPortfolio} className="d-flex flex-wrap gap-3 align-end">
                                    <div className="form-group flex-1 min-w-150 m-0 custom-select-wrapper">
                                         <label>SELECT MARKET</label>
                                         <select value={portoType} onChange={(e) => setPortoType(e.target.value)} className="w-full p-3 bg-black text-white font-bold font-mono border border-gray-700 rounded" style={{ height: '48px' }}><option value="crypto">Crypto (USD)</option><option value="saham">Stocks (Yahoo)</option></select>
                                    </div>
                                    <div className="form-group flex-1 min-w-150 m-0"><label>TICKER SYMBOL</label><input type="text" value={portoSymbol} onChange={(e)=>setPortoSymbol(e.target.value)} required placeholder="BTC..." className="uppercase font-bold font-mono" /></div>
                                    <div className="form-group flex-1 min-w-150 m-0"><label>VOLUME / QTY</label><input type="number" step="any" value={portoQty} onChange={(e)=>setPortoQty(e.target.value)} required placeholder="0.00" className="font-bold font-mono" /></div>
                                    <div className="form-group flex-1 min-w-150 m-0"><label>CAPITAL (IDR)</label><input type="number" value={portoBuy} onChange={(e)=>setPortoBuy(e.target.value)} required placeholder="0" className="font-bold font-mono" /></div>
                                    <button type="submit" className="btn-main font-mono text-lg flex-shrink-0 hover-float" style={{ padding: '14px 24px', background: 'var(--blue)', color: '#000', border: 'none' }}>LINK</button>
                                </form>
                            </div>
                            <div className="glass-card p-0 overflow-visible">
                                <ul className="data-list p-3 max-h-400 scroll-y">
                                    {portfolios.map((a, i) => {
                                        const currentPrice = livePrices[a.symbol] || (a.buy / a.qty);
                                        const val = currentPrice * a.qty;
                                        const profit = val - a.buy;
                                        const pct = a.buy > 0 ? ((profit / a.buy) * 100).toFixed(2) : 0;
                                        
                                        const isProfit = profit >= 0;
                                        const badgeBg = isProfit ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255, 42, 42, 0.1)';
                                        const badgeColor = isProfit ? 'var(--blue)' : 'var(--rose)';
                                        const badgeText = isProfit ? `+${pct}%` : `${pct}%`;
                                        const profitColorClass = isProfit ? 'text-blue' : 'text-rose';
                                        const borderClass = isProfit ? 'var(--blue)' : 'var(--rose)';

                                        return (
                                            <li key={a.id || i} style={{ borderLeft: `3px solid ${borderClass}` }}>
                                                <div className="d-flex align-center">
                                                    <div className="icon-box bg-glass mr-3">
                                                        <i className={`${a.type === "crypto" ? "fab fa-bitcoin text-yellow" : "fas fa-building text-blue"}`}></i>
                                                    </div>
                                                    <div>
                                                        <h4 className="mb-1 tx-title font-bold uppercase">{a.symbol} <span className="text-muted text-sm ml-1 font-mono">[QTY: {a.qty}]</span></h4>
                                                        <span className="text-muted text-xs font-mono uppercase">Modal: {formatRp(a.buy)}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right d-flex align-center">
                                                    <div className="mr-2 text-right">
                                                        <h3 className={`font-mono mb-1 font-bold ${profitColorClass}`}>{formatRp(val)}</h3>
                                                        <span className="badge font-bold" style={{ background: badgeBg, color: badgeColor }}>{badgeText}</span>
                                                    </div> 
                                                    <button onClick={() => handleDeletePortfolio(a.id)} className="btn-icon-small border-0 hover-bg-rose ml-2 text-muted"><i className="fas fa-trash"></i></button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    )}
                </main>

                <aside className={`intel-panel ${isIntelOpen ? 'open' : 'slide-left'}`}>
                    <button className="btn-icon-round bg-rose text-white mobile-only absolute-tr" onClick={() => setIsIntelOpen(false)}><i className="fas fa-times"></i></button>
                    
                    <div className="intel-section mb-4 mt-2">
                        <div className="d-flex align-center gap-3 mb-4">
                            <div className="icon-box border-blue text-blue blink-text"><i className="fas fa-network-wired"></i></div>
                            <h3 className="title-md text-white m-0">NLP & OCR ENGINE</h3>
                        </div>
                        
                        <form onSubmit={handleAIProcessing} className="flex-col gap-3">
                            <textarea 
                                value={aiInput} 
                                onChange={(e) => setAiInput(e.target.value)} 
                                onKeyDown={handleKeyDown}
                                placeholder={isOpticScanning ? ">> SCANNING IN PROGRESS..." : ">> Ketik log lalu Enter..."} 
                                className="w-full font-mono bg-black text-white p-3 border border-gray-700 rounded"
                                rows="3"
                                disabled={isOpticScanning}
                            />
                            
                            {/* Pemisahan proses kamera dan file */}
                            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => handleOpticScan(e, false)} />
                            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={(e) => handleOpticScan(e, true)} />

                            <div className="d-flex gap-2">
                                <button type="button" onClick={() => fileInputRef.current.click()} disabled={isOpticScanning} className="btn-action text-center m-0 flex-1 hover-float uppercase border border-yellow text-yellow hover-bg-yellow" style={{ padding: '8px' }}>
                                    {isOpticScanning ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-image"></i>}<br /><span className="text-xs">FILE</span>
                                </button>
                                <button type="button" onClick={() => cameraInputRef.current.click()} disabled={isOpticScanning} className="btn-action text-center m-0 flex-1 hover-float uppercase border border-yellow text-yellow hover-bg-yellow" style={{ padding: '8px' }}>
                                    {isOpticScanning ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-camera"></i>}<br /><span className="text-xs">CAM</span>
                                </button>
                                <button type="submit" disabled={isOpticScanning} className="btn-action text-center m-0 flex-1 hover-float uppercase bg-gradient-blue text-white font-bold border-0" style={{ padding: '8px' }}>
                                    <i className="fas fa-paper-plane"></i><br /><span className="text-xs">SEND</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    <hr className="intel-divider" />

                    <div className="intel-section flex-1 d-flex flex-col">
                        <div className="d-flex justify-between align-center mb-4"><h3 className="title-md text-white m-0"><i className="fas fa-star text-yellow mr-2"></i> OBJECTIVES</h3><button onClick={() => setIsGoalModalOpen(true)} className="btn-icon-small border-yellow text-yellow hover-bg-blue"><i className="fas fa-plus"></i></button></div>
                        <ul className="data-list scroll-y flex-1 p-0 border-0 bg-transparent shadow-none" style={{ margin: '0 -10px', padding: '0 10px' }}>
                            {goals.map(g => {
                                const pct = Math.min((g.saved / g.target) * 100, 100);
                                return (
                                    <li key={g.id} className="goal-item" style={{ display: 'block' }}>
                                        <div className="d-flex justify-between align-start mb-2 gap-2"><h4 className="text-white font-bold uppercase text-sm flex-1 word-break m-0">{g.name}</h4><div className="d-flex gap-2 flex-shrink-0"><button onClick={() => injectGoalFund(g.id, g.name)} className="btn-icon-small text-blue hover-bg-blue"><i className="fas fa-plus"></i></button><button onClick={() => handleDeleteGoal(g.id)} className="btn-icon-small text-muted hover-bg-rose"><i className="fas fa-trash"></i></button></div></div>
                                        <div className="d-flex flex-col gap-1 text-xs font-mono mb-2 mt-2 w-full"><div className="d-flex justify-between"><span className="text-muted">TERKUMPUL:</span><span className="text-blue font-bold">{formatRp(g.saved)}</span></div><div className="d-flex justify-between"><span className="text-muted">TARGET:</span><span className="text-white">{formatRp(g.target)}</span></div></div>
                                        <div className="progress-bg"><div className="progress-bar" style={{ width: `${pct}%`, background: 'var(--yellow)', boxShadow: '0 0 10px rgba(255, 145, 0, 0.5)' }}></div></div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </aside>
            </div>
            
            <button className="mobile-fab" onClick={() => setIsIntelOpen(true)}><i className="fas fa-network-wired text-xl text-black"></i></button>

            {/* MODAL USERNAME */}
            {isUsernameModalOpen && (
                <div className="modal-wrapper" style={{ display: 'flex' }}>
                    <div className="glass-card mx-auto w-full max-w-sm p-5 bounce-in border-blue">
                        <div className="d-flex justify-between border-b pb-4 mb-4">
                            <h3 className="text-white uppercase font-bold"><i className="fas fa-user-edit text-blue mr-2"></i> EDIT USERNAME</h3>
                            <button className="btn-icon-small text-rose border-rose hover-bg-rose" onClick={() => setIsUsernameModalOpen(false)}><i className="fas fa-times"></i></button>
                        </div>
                        <form onSubmit={handleUpdateUsername}>
                            <div className="form-group mb-5">
                                <label>NEW DISPLAY NAME</label>
                                <input type="text" value={newUsername} onChange={(e)=>setNewUsername(e.target.value)} required placeholder="Ketik nama baru..." className="uppercase font-mono w-full p-2 border bg-black text-white" />
                            </div>
                            <button type="submit" className="btn-main bg-gradient-blue text-white w-full hover-float font-mono text-lg font-bold">SAVE CHANGES</button>
                        </form>
                    </div>
                </div>
            )}

            {confirmDialog.isOpen && (
                <div className="modal-wrapper" style={{ display: 'flex' }}>
                    <div className="glass-card text-center mx-auto w-full max-w-sm p-5 bounce-in relative overflow-hidden" style={{ border: '2px solid var(--rose)' }}><div className="icon-box bg-rose text-black mx-auto mb-4" style={{ width: '60px', height: '60px', fontSize: '2rem', borderRadius: 0 }}><i className="fas fa-exclamation-triangle"></i></div><h3 className="mb-2 text-xl text-white font-bold uppercase">WARNING</h3><p className="text-muted mb-4 line-height-relaxed uppercase font-mono text-sm">{confirmDialog.message}</p>
                        <div className="grid-2 gap-3 mt-4"><button onClick={() => setConfirmDialog({ isOpen: false, message: "", onConfirm: null })} className="btn-action hover-float text-center">CANCEL</button><button onClick={confirmDialog.onConfirm} className="btn-main bg-rose text-white border-0 hover-float font-mono">CONFIRM</button></div>  
                    </div>
                </div>
            )}

            {isBudgetModalOpen && (
                <div className="modal-wrapper" style={{ display: 'flex' }}>
                    <div className="glass-card mx-auto w-full max-w-lg p-5 bounce-in border-blue"><div className="d-flex justify-between border-b pb-4 mb-4"><h3 className="text-white uppercase font-bold"><i className="fas fa-sliders-h text-blue mr-2"></i> PROTOCOL SETTINGS</h3><button className="btn-icon-small text-rose border-rose hover-bg-rose" onClick={() => setIsBudgetModalOpen(false)}><i className="fas fa-times"></i></button></div>  
                        <div className="scroll-y mb-4 pr-2" style={{ maxHeight: '40vh' }}>{budgets.map((b, i) => (<div key={i} className="d-flex align-center gap-3 mb-2 bg-dark p-2 rounded border" style={{ borderLeft: `4px solid ${b.color}` }}><span className="flex-2 text-white font-bold uppercase text-sm truncate">{b.category}</span><span className="flex-1 font-mono text-blue">{formatRp(b.target)}</span><button onClick={() => handleDeleteBudget(b.category)} className="btn-icon-small text-rose hover-bg-rose border-0 m-0"><i className="fas fa-trash-alt"></i></button></div>))}</div>
                        <h4 className="text-xs text-blue mb-3 font-bold uppercase letter-spacing-1">INITIALIZE NEW PROTOCOL</h4> 
                        <div className="d-flex gap-3 mb-4 align-center flex-wrap mobile-grid-1"><input type="text" value={newBudgetCat} onChange={(e)=>setNewBudgetCat(e.target.value)} placeholder="CATEGORY NAME" className="flex-2 min-w-150 uppercase font-mono p-2 border bg-black text-white" /><input type="number" value={newBudgetTarget} onChange={(e)=>setNewBudgetTarget(e.target.value)} placeholder="MAX LIMIT (IDR)" className="flex-1 min-w-150 font-bold font-mono p-2 border bg-black text-white" /><button type="button" onClick={handleAddBudget} className="btn-icon-small border-blue text-blue hover-bg-blue p-3"><i className="fas fa-plus"></i></button></div>
                    </div>
                </div>
            )}

            {isGoalModalOpen && (
                <div className="modal-wrapper" style={{ display: 'flex' }}>
                    <div className="glass-card mx-auto w-full max-w-sm p-5 bounce-in border-yellow"><div className="d-flex justify-between border-b pb-4 mb-4"><h3 className="text-white uppercase font-bold"><i className="fas fa-star text-yellow mr-2"></i> NEW OBJECTIVE</h3><button className="btn-icon-small text-rose border-rose hover-bg-rose" onClick={() => setIsGoalModalOpen(false)}><i className="fas fa-times"></i></button></div>  
                        <form onSubmit={handleAddGoal}><div className="form-group mb-4"><label>OBJECTIVE ID / NAME</label><input type="text" value={newGoalName} onChange={(e)=>setNewGoalName(e.target.value)} required placeholder="INPUT STRING..." className="uppercase font-mono w-full p-2 border bg-black text-white" /></div><div className="form-group mb-5"><label>TARGET CAPACITY (IDR)</label><input type="number" value={newGoalTarget} onChange={(e)=>setNewGoalTarget(e.target.value)} required placeholder="1000000" className="font-bold input-lg font-mono text-yellow w-full p-2 border bg-black" /></div><button type="submit" className="btn-main bg-yellow text-black w-full hover-float font-mono text-lg font-bold"><i className="fas fa-rocket mr-2"></i> INITIATE SEQUENCE</button></form>
                    </div>
                </div>
            )}
        </div>
    );
}