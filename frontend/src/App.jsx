import React, { useState, useEffect } from 'react';
import { api } from './api';
import { 
  Plus, Calendar, Award, Trophy, User, LogOut, CheckCircle, 
  Clock, Image, Eye, Edit3, ShieldAlert, Search, Star, Download,
  Palette, Sparkles
} from 'lucide-react';
import logoImg from './assets/logo.png';

const getShowcaseWinnerTitle = (dayNumber) => {
  const day = parseInt(dayNumber) || 1;
  const week = Math.min(Math.ceil(day / 7), 4);
  const suffixes = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  return `${suffixes[week] || '1st'} Week Showcase Winner`;
};

const getShowcaseWinnerShortTitle = (dayNumber) => {
  const day = parseInt(dayNumber) || 1;
  const week = Math.min(Math.ceil(day / 7), 4);
  const suffixes = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  return `${suffixes[week] || '1st'} Wk Winner`;
};

export default function App() {
  // Session / Authentication states
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register_student'
  
  // Login / Signup forms state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCollege, setRegCollege] = useState('');
  const [regYear, setRegYear] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Topics and Leaderboard data
  const [topics, setTopics] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Student Dash metrics
  const [studentMetrics, setStudentMetrics] = useState({ total_posts: 0, total_points: 0, rank: 0, title: 'CLUB MEMBER', badges: [] });
  const [submissionTracker, setSubmissionTracker] = useState({});
  const [studentGraphData, setStudentGraphData] = useState([]);
  const [studentUploads, setStudentUploads] = useState([]);

  // Dynamic Month Cycles
  const CYCLES = [
    { id: '2026-07-06', name: 'July 6, 2026 — August 6, 2026' },
    { id: '2026-08-06', name: 'August 6, 2026 — September 6, 2026' },
    { id: '2026-09-06', name: 'September 6, 2026 — October 6, 2026' },
    { id: '2026-10-06', name: 'October 6, 2026 — November 6, 2026' },
    { id: '2026-11-06', name: 'November 6, 2026 — December 6, 2026' },
    { id: '2026-12-06', name: 'December 6, 2026 — January 6, 2027' },
    { id: '2027-01-06', name: 'January 6, 2027 — February 6, 2027' },
    { id: '2027-02-06', name: 'February 6, 2027 — March 6, 2027' },
    { id: '2027-03-06', name: 'March 6, 2027 — April 6, 2027' },
    { id: '2027-04-06', name: 'April 6, 2027 — May 6, 2027' },
    { id: '2027-05-06', name: 'May 6, 2027 — June 6, 2027' },
  ];

  const getDefaultCycle = () => {
    const today = new Date();
    for (let i = 0; i < CYCLES.length; i++) {
      const start = new Date(CYCLES[i].id);
      const nextStart = i < CYCLES.length - 1 ? new Date(CYCLES[i+1].id) : new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000);
      if (today >= start && today < nextStart) {
        return CYCLES[i].id;
      }
    }
    if (today < new Date(CYCLES[0].id)) {
      return CYCLES[0].id;
    }
    return CYCLES[CYCLES.length - 1].id;
  };

  const [selectedCycle, setSelectedCycle] = useState(getDefaultCycle());
  const [uploadTopic, setUploadTopic] = useState('');
  const [viewingSubmission, setViewingSubmission] = useState(null);
  const [celebAwardUpload, setCelebAwardUpload] = useState(null);
  const [celebInstaUpload, setCelebInstaUpload] = useState(null);
  
  const [coordinatorTab, setCoordinatorTab] = useState('submissions'); // 'submissions' | 'polls' | 'insights' | 'daily-tasks'
  const [adminStats, setAdminStats] = useState(null);
  const [statsTimeframe, setStatsTimeframe] = useState('30days');
  const [showTaskPopup, setShowTaskPopup] = useState(false);
  const [activeTodayTopic, setActiveTodayTopic] = useState(null);
  const [popupType, setPopupType] = useState('new'); // 'new' | 'updated'
  const [previousTask, setPreviousTask] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [instaPicks, setInstaPicks] = useState([]);

  const [adminPolls, setAdminPolls] = useState([]);
  const [activePollAdmin, setActivePollAdmin] = useState(null);
  const [activePoll, setActivePoll] = useState(null);
  const [selectedPollOption, setSelectedPollOption] = useState('');

  const handleCloseCelebModal = () => {
    if (celebAwardUpload) {
      const ackStr = localStorage.getItem('acknowledged_awards') || '[]';
      let acknowledged = [];
      try {
        acknowledged = JSON.parse(ackStr);
      } catch (e) {
        acknowledged = [];
      }
      if (!acknowledged.includes(celebAwardUpload._id)) {
        acknowledged.push(celebAwardUpload._id);
        localStorage.setItem('acknowledged_awards', JSON.stringify(acknowledged));
      }
    }
    setCelebAwardUpload(null);
  };

  const handleCloseInstaModal = () => {
    if (celebInstaUpload) {
      const ackStr = localStorage.getItem('acknowledged_insta_picks') || '[]';
      let acknowledged = [];
      try {
        acknowledged = JSON.parse(ackStr);
      } catch (e) {
        acknowledged = [];
      }
      if (!acknowledged.includes(celebInstaUpload._id)) {
        acknowledged.push(celebInstaUpload._id);
        localStorage.setItem('acknowledged_insta_picks', JSON.stringify(acknowledged));
      }
    }
    setCelebInstaUpload(null);
  };
  
  
  const generateCycleDays = (cycleId) => {
    const days = [];
    const parts = cycleId.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    
    let current = new Date(year, month, day, 12, 0, 0);
    const nextMonthEnd = new Date(year, month + 1, day, 12, 0, 0);
    
    let dayIndex = 1;
    while (current < nextMonthEnd) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      days.push({
        day: dayIndex,
        date: dateStr,
        dayName: current.toLocaleDateString('en-US', { weekday: 'long' }),
      });
      current.setDate(current.getDate() + 1);
      dayIndex++;
    }
    return days;
  };

  const getCurrentDayNumber = (cycleId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(cycleId);
    start.setHours(0, 0, 0, 0);
    const diffTime = today - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // 1-indexed
    return Math.max(1, Math.min(diffDays, 31));
  };

  const cycleDays = generateCycleDays(selectedCycle);

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  // Coordinator Admin lists
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminUploads, setAdminUploads] = useState([]);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null); // Detail profile report modal
  
  // Modal configurations
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedDayNumber, setSelectedDayNumber] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  
  // Submissions forms
  const [uploadType, setUploadType] = useState('task'); // 'task' | 'meme' | 'both'
  const [uploadTool, setUploadTool] = useState('');
  const [uploadTime, setUploadTime] = useState(30);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploadMemeFile, setUploadMemeFile] = useState(null);
  const [uploadMemePreview, setUploadMemePreview] = useState('');
  
  // Review systems
  const [reviewingUpload, setReviewingUpload] = useState(null);
  const [evalFeedback, setEvalFeedback] = useState('');
  const [evalShowcase, setEvalShowcase] = useState('none'); // 'none', 'top3', 'win1'
  const [evalExtraPoints, setEvalExtraPoints] = useState(0);
  const [evalBasePoints, setEvalBasePoints] = useState(0);

  // Search/Filters
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [uploadsFilter, setUploadsFilter] = useState('all'); 
  const [uploadsSearch, setUploadsSearch] = useState('');
  
  // Topic admin
  const [editingTopic, setEditingTopic] = useState(null);
  const [editedTopicTitle, setEditedTopicTitle] = useState('');
  const [editedTopicDesc, setEditedTopicDesc] = useState('');
  const [editedTopicDate, setEditedTopicDate] = useState('');

  // Auto Logout decorator check
  const checkResponseError = (res) => {
    if (res && res.error) {
      if (res.error.includes('expired') || res.error.includes('token') || res.error.includes('Authentication')) {
        handleLogout();
      }
      setErrorMsg(res.error);
      return true;
    }
    return false;
  };

  useEffect(() => {
    // Clear student dashboard and admin data immediately to prevent visual bleed through/stale color grids
    setSubmissionTracker({});
    setStudentUploads([]);
    setStudentGraphData([]);
    setStudentMetrics({ total_posts: 0, total_points: 0, rank: 0, title: 'CLUB MEMBER', badges: [] });
    setAdminStudents([]);
    setAdminUploads([]);
    setSelectedStudentDetail(null);
  }, [selectedCycle]);

  useEffect(() => {
    if (token && user) {
      loadDashboardData(selectedCycle);
    }
  }, [token, user?.role, selectedCycle]);

  useEffect(() => {
    if (user && user.role === 'student' && studentUploads && studentUploads.length > 0) {
      const ackStr = localStorage.getItem('acknowledged_awards') || '[]';
      let acknowledged = [];
      try {
        acknowledged = JSON.parse(ackStr);
      } catch (e) {
        acknowledged = [];
      }
      
      const awarded = studentUploads.find(u => 
        (u.showcase_award === 'win1' || u.points_breakdown?.showcase_bonus === 25) &&
        !acknowledged.includes(u._id)
      );
      if (awarded) {
        setCelebAwardUpload(awarded);
      }
    }
  }, [studentUploads, user]);

  useEffect(() => {
    if (user && user.role === 'student' && studentUploads && studentUploads.length > 0) {
      const ackStr = localStorage.getItem('acknowledged_insta_picks') || '[]';
      let acknowledged = [];
      try {
        acknowledged = JSON.parse(ackStr);
      } catch (e) {
        acknowledged = [];
      }
      
      const picked = studentUploads.find(u => 
        u.is_insta_pick &&
        !acknowledged.includes(u._id)
      );
      if (picked) {
        setCelebInstaUpload(picked);
      }
    }
  }, [studentUploads, user]);

  useEffect(() => {
    if (user && user.role === 'student' && topics && topics.length > 0) {
      const currentDayNum = getCurrentDayNumber(selectedCycle);
      const todayTopic = topics.find(t => t.day === currentDayNum && t.announced);
      
      if (todayTopic) {
        setActiveTodayTopic(todayTopic);
        const ackKey = `acknowledged_task_${todayTopic._id}`;
        const lastAckStr = localStorage.getItem(ackKey);
        
        let shouldShow = false;
        let pType = 'new';
        let prevT = null;
        
        if (!lastAckStr) {
          shouldShow = true;
          if (todayTopic.is_updated) {
            pType = 'updated';
            prevT = { title: todayTopic.prev_title, desc: todayTopic.prev_desc };
          } else {
            pType = 'new';
          }
        } else {
          try {
            const lastAck = JSON.parse(lastAckStr);
            if (lastAck.announced_at !== todayTopic.announced_at) {
              shouldShow = true;
              pType = 'updated';
              prevT = { 
                title: todayTopic.prev_title || lastAck.title, 
                desc: todayTopic.prev_desc || lastAck.desc 
              };
            }
          } catch (e) {
            if (lastAckStr !== todayTopic.announced_at) {
              shouldShow = true;
              if (todayTopic.is_updated) {
                pType = 'updated';
                prevT = { title: todayTopic.prev_title, desc: todayTopic.prev_desc };
              } else {
                pType = 'new';
              }
            }
          }
        }
        
        if (shouldShow) {
          setPopupType(pType);
          setPreviousTask(prevT);
          setShowTaskPopup(true);
        }
      } else {
        setActiveTodayTopic(null);
        setShowTaskPopup(false);
      }
    }
  }, [topics, selectedCycle, user?.role]);

  const loadDashboardData = async (cycle = selectedCycle) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const lbRes = await api.getLeaderboard(cycle);
      if (!checkResponseError(lbRes)) {
        setLeaderboard(lbRes);
      }
      
      const topicsRes = await api.getTopics(cycle);
      if (topicsRes && !topicsRes.error) {
        setTopics(topicsRes);
      }

      if (user.role === 'student') {
        const dashRes = await api.getStudentDashboard(cycle);
        if (!checkResponseError(dashRes)) {
          setStudentMetrics(dashRes.metrics);
          setSubmissionTracker(dashRes.submission_tracker || {});
          setStudentGraphData(dashRes.graph_data || []);
          setStudentUploads(dashRes.uploads || []);
        }
        
        // Fetch active poll
        const pollRes = await api.getActivePoll();
        if (pollRes && !pollRes.error) {
          setActivePoll(pollRes);
        } else {
          setActivePoll(null);
        }
      } else if (user.role === 'leader') {
        const studentsRes = await api.getAdminStudents(cycle);
        if (!checkResponseError(studentsRes)) {
          setAdminStudents(studentsRes);
        }
        const uploadsRes = await api.getAdminUploads(cycle);
        if (!checkResponseError(uploadsRes)) {
          setAdminUploads(uploadsRes);
        }
        
        // Fetch Insta Picks and Polls
        const picksRes = await api.getInstaPicks(cycle);
        if (picksRes && !picksRes.error) {
          setInstaPicks(picksRes);
        }
        const pollsRes = await api.getAdminPolls(cycle);
        if (pollsRes && !pollsRes.error) {
          setAdminPolls(pollsRes);
          const active = pollsRes.find(p => p.status === 'active');
          setActivePollAdmin(active || null);
        }
      }
    } catch (e) {
      setErrorMsg("Failed to connect to the server. Make sure the Flask backend is active.");
    } finally {
      setLoading(false);
    }
  };

  const loadAdminStats = async (timeframe = statsTimeframe, cycle = selectedCycle) => {
    try {
      const res = await api.getAdminDashboardStats(timeframe, cycle);
      if (res && !res.error) {
        setAdminStats(res);
      }
    } catch (e) {
      console.error("Failed to fetch admin stats", e);
    }
  };

  const handleSendEmail = async () => {
    setEmailLoading(true);
    setEmailStatus('');
    try {
      const res = await api.sendAdminStatsEmail(statsTimeframe, selectedCycle);
      if (res.error) {
        setEmailStatus(`❌ ${res.error}`);
      } else {
        setEmailStatus(`✅ ${res.message}`);
      }
    } catch (err) {
      setEmailStatus("❌ Failed to contact reporting server.");
    } finally {
      setEmailLoading(false);
      setTimeout(() => {
        setEmailStatus('');
      }, 5000);
    }
  };

  useEffect(() => {

    if (token && user && user.role === 'leader') {
      loadAdminStats(statsTimeframe, selectedCycle);
    }
  }, [statsTimeframe, selectedCycle, token, user?.role]);

  const handleLogin = async (e) => {

    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    
    try {
      const res = await api.login({ email: loginEmail, password: loginPassword });
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
        setSuccessMsg("Logged in successfully!");
        setLoginEmail('');
        setLoginPassword('');
      }
    } catch (err) {
      setErrorMsg("Unable to connect to the backend server.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const payload = {
      name: regName,
      email: regEmail,
      password: regPassword,
      college_name: regCollege,
      passout_year: regYear,
      role: 'student'
    };

    try {
      const res = await api.register(payload);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
        setSuccessMsg("Account registered successfully!");
        setAuthMode('login');
        setRegName('');
        setRegEmail('');
        setRegPassword('');
        setRegCollege('');
        setRegYear('');
      }
    } catch (err) {
      setErrorMsg("Unable to connect to the backend server.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setErrorMsg('');
    setSuccessMsg('');
    setUploadModalOpen(false);
    setZoomedImage(null);
    setSelectedStudentDetail(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
    }
  };

  const handleMemeFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadMemeFile(file);
      setUploadMemePreview(URL.createObjectURL(file));
    }
  };

  const handleDownloadImage = async (imageUrl, filename) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'download.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // Fallback: open in new tab if direct download block occurs
      window.open(imageUrl, '_blank');
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!uploadFile) {
      setErrorMsg(uploadType === 'meme' ? "Please select a meme graphic image to upload." : "Please select a design task image to upload.");
      return;
    }

    if (uploadType === 'both' && !uploadMemeFile) {
      setErrorMsg("Please select both a design task image and a meme graphic image.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('cycle_id', selectedCycle);
    formData.append('day_number', selectedDayNumber);
    formData.append('type', uploadType);
    formData.append('tool_used', uploadTool);
    formData.append('time_taken', uploadTime);
    formData.append('topic', uploadTopic);
    formData.append('image', uploadFile);
    if (uploadType === 'both') {
      formData.append('image_meme', uploadMemeFile);
    }

    try {
      const res = await api.uploadTask(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`Task uploaded successfully! You earned +${res.points_earned} points.`);
        setUploadModalOpen(false);
        setUploadFile(null);
        setUploadPreview('');
        setUploadMemeFile(null);
        setUploadMemePreview('');
        setUploadTool('');
        setUploadTime(30);
        setUploadTopic('');
        loadDashboardData();
      }
    } catch (err) {
      setErrorMsg("Upload failed due to server connection error.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReview = (upload) => {
    setReviewingUpload(upload);
    setEvalFeedback(upload.feedback || "I like: \nI wish: \nWhat if: ");
    setEvalExtraPoints(upload.points_breakdown?.manual_bonus || 0);
    setEvalBasePoints(upload.points_breakdown?.base_points || upload.points_awarded);
    
    const bonus = upload.points_breakdown?.showcase_bonus || 0;
    if (bonus === 25) setEvalShowcase('win1');
    else setEvalShowcase('none');
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await api.evaluateUpload(reviewingUpload._id, {
        feedback: evalFeedback,
        showcase_award: evalShowcase,
        extra_points: evalExtraPoints,
        base_points: evalBasePoints
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("Evaluation submitted successfully!");
        setReviewingUpload(null);
        loadDashboardData();
        if (selectedStudentDetail) {
          handleOpenStudentDetail(selectedStudentDetail.student.id);
        }
      }
    } catch (err) {
      setErrorMsg("Evaluation submission failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStudentDetail = async (studentId) => {
    setLoading(true);
    try {
      const res = await api.getStudentUploadsDetail(studentId, selectedCycle);
      if (!checkResponseError(res)) {
        setSelectedStudentDetail(res);
      }
    } catch (err) {
      setErrorMsg("Failed to load student details.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustPoints = async (e, type) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const payload = { cycle: selectedCycle };
    if (type === 'feedback') {
      const current = selectedStudentDetail.student.feedback_points || 0;
      payload.feedback_points = current + 2; 
    } else if (type === 'bonus') {
      const bonusVal = prompt("Enter additional bonus points to award:", "10");
      if (bonusVal === null) {
        setLoading(false);
        return;
      }
      payload.manual_bonus = (selectedStudentDetail.student.manual_bonus || 0) + parseInt(bonusVal || '0');
    } else if (type === 'badge') {
      const badgeVal = prompt("Enter special award/badge title (e.g. FUNNIEST MEME OF THE MONTH):", selectedStudentDetail.student.custom_badge || "");
      if (badgeVal === null) {
        setLoading(false);
        return;
      }
      payload.custom_badge = badgeVal;
    }

    try {
      const res = await api.adjustStudentPoints(selectedStudentDetail.student.id, payload);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("Points/Badges adjusted successfully!");
        handleOpenStudentDetail(selectedStudentDetail.student.id);
        loadDashboardData();
      }
    } catch (e) {
      setErrorMsg("Failed to adjust points.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTopic = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await api.addTopic({
        cycle_id: selectedCycle,
        date: editedTopicDate,
        day: editingTopic.day,
        title: editedTopicTitle,
        desc: editedTopicDesc
      });
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`Task for Day ${editingTopic.day} (${editedTopicDate}) saved and announced!`);
        setEditingTopic(null);
        loadDashboardData();
      }
    } catch (err) {
      setErrorMsg("Failed to save task.");
    } finally {
      setLoading(false);
    }
  };

  const renderSvgGraph = (data, totalDays = 30) => {
    if (!data || data.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-zinc-400 text-xs font-mono">
          No submission points yet. Your progress line will render here.
        </div>
      );
    }

    const width = 650;
    const height = 240;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const maxVal = Math.max(...data.map(d => d.cumulative), 15);
    const gridMax = Math.ceil(maxVal / 5) * 5; 
    const maxDay = totalDays;
    
    const points = data.map(d => {
      const x = paddingLeft + ((d.day > totalDays ? totalDays : d.day) / maxDay) * chartWidth;
      const y = paddingTop + chartHeight - (d.cumulative / gridMax) * chartHeight;
      return { x, y, ...d };
    });

    const pathD = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, "");

    return (
      <div className="w-full h-full overflow-hidden bg-zinc-50 border border-zinc-200 p-2 select-none relative rounded-xl">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-zinc-500">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
            const y = paddingTop + chartHeight * ratio;
            const value = Math.round(gridMax * (1 - ratio));
            return (
              <g key={`y-${index}`}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#e4e4e7" strokeDasharray="3 3" />
                <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="text-[10px] font-mono fill-zinc-400">{value}</text>
              </g>
            );
          })}

          {[0, Math.ceil(totalDays * 0.25), Math.ceil(totalDays * 0.5), Math.ceil(totalDays * 0.75), totalDays].map((dayNum, index) => {
            const x = paddingLeft + (dayNum / maxDay) * chartWidth;
            return (
              <g key={`x-${index}`}>
                <line x1={x} y1={paddingTop} x2={x} y2={height - paddingBottom} stroke="#e4e4e7" strokeDasharray="3 3" />
                <text x={x} y={height - paddingBottom + 16} textAnchor="middle" className="text-[10px] font-mono fill-zinc-400">Day {dayNum}</text>
              </g>
            );
          })}

          {points.length > 1 && (
            <path
              d={`${pathD} L ${points[points.length-1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`}
              fill="url(#grad)"
              opacity="0.08"
            />
          )}

          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, idx) => (
            <g key={`dot-${idx}`} className="group/dot cursor-pointer">
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="4.5" 
                fill="#ffffff" 
                stroke="#8b5cf6" 
                strokeWidth="2.5" 
                className="hover:r-6 hover:fill-[#8b5cf6] transition-all"
              />
              <title>{`Day ${p.day} (${p.date}): ${p.cumulative} pts`}</title>
            </g>
          ))}

          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  };

  const formatDateLabel = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
    } catch {
      return dateStr;
    }
  };

  // Unauthenticated screen: Light modern layout
  if (!token) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-4 relative bg-white overflow-hidden">
        
        {/* Decorative Floating Background Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
          
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 bg-[radial-gradient(#f0f0f0_1px,transparent_1px)] bg-[size:24px_24px] opacity-80"></div>
          
          {/* Floating Instagram Gradient Icon 1 (Top Right) */}
          <div className="absolute right-24 top-20 w-14 h-14 animate-fly-drift opacity-90 hidden lg:block">
            <div className="w-full h-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2.5px] rounded-xl shadow-md">
              <div className="w-full h-full bg-white rounded-[9px] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-8 h-8 stroke-[1.8]" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <linearGradient id="ig-grad-bg-1" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f09433" />
                    <stop offset="50%" stopColor="#dc2743" />
                    <stop offset="100%" stopColor="#bc1888" />
                  </linearGradient>
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#ig-grad-bg-1)"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="url(#ig-grad-bg-1)"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="url(#ig-grad-bg-1)"></line>
                </svg>
              </div>
            </div>
          </div>

          {/* Floating Instagram Gradient Icon 2 (Left Bottom) */}
          <div className="absolute left-24 bottom-24 w-12 h-12 animate-fly-drift opacity-85 hidden md:block">
            <div className="w-full h-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2px] rounded-xl shadow-sm">
              <div className="w-full h-full bg-white rounded-[9px] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-[1.8]" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <linearGradient id="ig-grad-bg-2" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f09433" />
                    <stop offset="50%" stopColor="#dc2743" />
                    <stop offset="100%" stopColor="#bc1888" />
                  </linearGradient>
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#ig-grad-bg-2)"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="url(#ig-grad-bg-2)"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="url(#ig-grad-bg-2)"></line>
                </svg>
              </div>
            </div>
          </div>
          
          {/* Floating Design Pic Card 1 (Top Left): Dark Theme Poster */}
          <div className="absolute left-12 top-16 w-36 h-48 bg-zinc-955 border border-zinc-800 rounded-2xl p-4 shadow-xl animate-float-slow rotate-[-6deg] hidden lg:flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="w-6 h-1.5 bg-[#8b5cf6] rounded-full"></span>
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
              </div>
              <div className="h-[2px] bg-zinc-800 w-full"></div>
              <div className="h-[2px] bg-zinc-800 w-2/3"></div>
            </div>
            
            {/* Poster graphic */}
            <div className="my-2 flex-1 rounded bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 flex items-center justify-center">
              <span className="text-[10px] text-white font-mono font-bold tracking-wider">CREATIVE</span>
            </div>

            <div className="flex justify-between items-center text-[8px] font-mono text-zinc-500">
              <span>DAY 01</span>
              <span>TASK COMPLETE</span>
            </div>
          </div>

          {/* Floating Design Pic Card 3 (Center Right): Figma Style Canvas */}
          <div className="absolute right-10 top-1/3 w-40 h-32 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-xl animate-float-fast rotate-[8deg] hidden lg:flex flex-col justify-between text-[8px] font-mono text-zinc-555 select-none">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-1.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              </div>
              <span className="text-zinc-400 font-bold uppercase text-[6px] bg-zinc-800 px-1 py-0.5 rounded">Figma Editor</span>
            </div>

            <div className="flex-1 relative bg-zinc-955 rounded-lg border border-zinc-850 my-1.5 overflow-hidden flex items-center justify-center">
              <div className="border border-dashed border-[#00c0ff]/60 px-3 py-1.5 text-center text-[#00c0ff] text-[7px] relative">
                <span>Poster Frame</span>
                <div className="absolute -top-1.5 -left-1.5 w-1.5 h-1.5 bg-[#00c0ff] border border-white"></div>
                <div className="absolute -bottom-1.5 -right-1.5 w-1.5 h-1.5 bg-[#00c0ff] border border-white"></div>
              </div>

              {/* Designer Cursor mockup */}
              <div className="absolute left-[65%] top-[55%] flex items-start gap-1">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-pink-500 fill-pink-500 drop-shadow">
                  <path d="M5.5 3.21V20.8l4.64-4.57 6.36.03-11-13.06z"></path>
                </svg>
                <span className="bg-pink-500 text-white font-bold px-1 py-0.2 rounded text-[6px]">Siddhartha</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-[7px]">
              <span>ZOOM: 1600%</span>
              <span className="text-[#00c0ff]">GRID: ON</span>
            </div>
          </div>
          
        </div>

        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-xl p-8 z-10">
          
          {/* Header logo */}
          <div className="flex flex-col items-center mb-6 border-b border-zinc-150 pb-4">
            <img src={logoImg} alt="Codegnan Logo" className="h-16 object-contain" />
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="mb-6 bg-red-50/50 border border-red-200/50 text-red-500 p-4 text-xs font-mono rounded-xl flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-400" />
              <div>{errorMsg}</div>
            </div>
          )}
          
          {successMsg && (
            <div className="mb-6 bg-zinc-50 border border-zinc-200 text-zinc-600 p-4 text-xs font-mono rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0 text-black" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Tab Selection toggle bar */}
          <div className="flex border border-zinc-200 mb-6 bg-zinc-50 p-1 rounded-xl">
            <button 
              onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
              className={`flex-1 py-2 text-xs font-bold font-mono tracking-wider transition-all uppercase rounded-lg cursor-pointer ${authMode === 'login' ? 'bg-black text-white shadow-sm' : 'text-zinc-400 hover:text-black'}`}
            >
              Sign In
            </button>
            <button 
              onClick={() => { setAuthMode('register_student'); setErrorMsg(''); }}
              className={`flex-1 py-2 text-xs font-bold font-mono tracking-wider transition-all uppercase rounded-lg cursor-pointer ${authMode === 'register_student' ? 'bg-black text-white shadow-sm' : 'text-zinc-400 hover:text-black'}`}
            >
              Join (Student)
            </button>
          </div>

          {/* Form wrapper */}
          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Email ID</label>
                <input 
                  type="email" 
                  value={loginEmail} 
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full premium-input font-mono"
                  placeholder="sid@gmail.com"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Password</label>
                <input 
                  type="password" 
                  value={loginPassword} 
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full premium-input font-mono"
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <button 
                type="submit" 
                disabled={loading}
                className="w-full premium-btn-black py-3 text-xs uppercase tracking-wide mt-6"
              >
                {loading ? "Verifying..." : "Sign In to Dashboard"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    value={regName} 
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full premium-input"
                    placeholder="Siddhartha Roy"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Email Address</label>
                  <input 
                    type="email" 
                    value={regEmail} 
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full premium-input font-mono"
                    placeholder="sid@gmail.com"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Password</label>
                  <input 
                    type="password" 
                    value={regPassword} 
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full premium-input font-mono"
                    placeholder="Create Password"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">College Name</label>
                  <input 
                    type="text" 
                    value={regCollege} 
                    onChange={(e) => setRegCollege(e.target.value)}
                    className="w-full premium-input"
                    placeholder="e.g. IIT Madras"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Passout Year</label>
                <select 
                  value={regYear} 
                  onChange={(e) => setRegYear(e.target.value)}
                  className="w-full premium-input font-mono"
                  required
                >
                  <option value="">-- Select Year --</option>
                  {Array.from({ length: 2040 - 1990 + 1 }, (_, i) => 1990 + i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full premium-btn-black py-3 text-xs uppercase tracking-wide mt-6"
              >
                {loading ? "Registering account..." : "Complete Registration"}
              </button>
            </form>
          )}

          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-zinc-150 font-mono text-[9px] text-zinc-500 uppercase">
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-black shrink-0" />
              <div>
                <span className="font-bold text-black block">DAILY CALENDAR</span>
                <span className="text-[8px] text-zinc-400 font-normal normal-case block">Track tasks & memes</span>
              </div>
            </div>
            
            <div className="flex items-start gap-2.5">
              <Trophy className="w-4 h-4 text-black shrink-0" />
              <div>
                <span className="font-bold text-black block">LEADERBOARD</span>
                <span className="text-[8px] text-zinc-400 font-normal normal-case block">Points & weekly ranks</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Award className="w-4 h-4 text-black shrink-0" />
              <div>
                <span className="font-bold text-black block">SATURDAY POLLS</span>
                <span className="text-[8px] text-zinc-400 font-normal normal-case block">Vote for best showcase</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Plus className="w-4 h-4 text-black shrink-0" />
              <div>
                <span className="font-bold text-black block">PEER CRITIQUE</span>
                <span className="text-[8px] text-zinc-400 font-normal normal-case block">Review weekly entries</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Shell (Light theme modern layout)
  return (
    <div className="min-h-screen flex flex-col relative bg-[#f8f9fa] overflow-hidden">
      
      {/* Subtle canvas background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-50 z-0"></div>

      {/* Floating Background Design & Instagram Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        
        {/* Floating Instagram Icon (Top Right) */}
        <div className="absolute right-[5%] top-[12%] w-24 h-24 animate-fly-drift opacity-15 hidden md:block">
          <div className="w-full h-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[3px] rounded-2xl shadow-lg">
            <div className="w-full h-full bg-[#f8f9fa] rounded-[13px] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-14 h-14 stroke-[1.8]" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <linearGradient id="ig-grad-bg-main" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f09433" />
                  <stop offset="50%" stopColor="#dc2743" />
                  <stop offset="100%" stopColor="#bc1888" />
                </linearGradient>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#ig-grad-bg-main)"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="url(#ig-grad-bg-main)"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="url(#ig-grad-bg-main)"></line>
              </svg>
            </div>
          </div>
        </div>

        {/* Floating Figma Symbol (Left Mid) */}
        <div className="absolute left-[3%] top-[30%] w-20 h-28 animate-float-slow opacity-15 hidden lg:flex flex-col gap-1 items-center justify-center">
          <div className="flex gap-1">
            <div className="w-8 h-8 rounded-l-full bg-[#f24e1e]"></div>
            <div className="w-8 h-8 rounded-r-full bg-[#a259ff]"></div>
          </div>
          <div className="flex gap-1">
            <div className="w-8 h-8 rounded-l-full bg-[#1abc9c]"></div>
            <div className="w-8 h-8 rounded-full bg-[#0acf83]"></div>
          </div>
          <div className="flex gap-1 self-start">
            <div className="w-8 h-8 rounded-l-full rounded-br-full bg-[#18a0fb]"></div>
          </div>
        </div>

        {/* Floating Palette Icon (Left Bottom) */}
        <div className="absolute left-[8%] bottom-[15%] p-4 bg-gradient-to-tr from-violet-500 to-fuchsia-500 text-white rounded-3xl shadow-xl animate-float-medium opacity-20 hidden md:block">
          <Palette className="w-10 h-10" />
        </div>

        {/* Floating Sparkles Icon (Right Bottom) */}
        <div className="absolute right-[10%] bottom-[20%] p-4 bg-gradient-to-tr from-amber-400 to-orange-500 text-white rounded-3xl shadow-xl animate-float-fast opacity-20 hidden md:block">
          <Sparkles className="w-10 h-10" />
        </div>

        {/* Floating Photoshop/Design Canvas Box (Right Mid) */}
        <div className="absolute right-[2%] top-[55%] w-32 h-20 bg-white border border-zinc-200 rounded-xl p-2 shadow-md animate-float-slow opacity-25 hidden xl:flex flex-col justify-between text-[6px] font-mono text-zinc-400">
          <div className="flex justify-between items-center border-b border-zinc-100 pb-1">
            <span className="font-bold text-black uppercase">Layers</span>
            <span>100%</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 bg-zinc-50 p-0.5 rounded">
              <div className="w-1.5 h-1.5 bg-purple-500 rounded-xs"></div>
              <span className="text-zinc-600 font-bold">Vector Path</span>
            </div>
            <div className="flex items-center gap-1 p-0.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-xs"></div>
              <span>Background.png</span>
            </div>
          </div>
        </div>
        
      </div>

      {/* Top Header navbar */}
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Codegnan Logo" className="h-10 object-contain" />
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-zinc-500">
              <User className="w-3.5 h-3.5 text-black" />
              <span>{user.name} ({user.role === 'leader' ? 'Coordinator' : 'Student'})</span>
            </div>

            <button 
              onClick={handleLogout}
              className="premium-btn-outline px-3.5 py-1.5 text-xs font-mono uppercase flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Container blocks */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 z-10">
        
        {errorMsg && (
          <div className="mb-6 bg-red-50/50 border border-red-200/50 text-red-500 p-4 text-xs font-mono rounded-2xl flex justify-between items-center shadow-xs">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <div>{errorMsg}</div>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-black font-mono text-sm px-2">×</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 bg-zinc-50 border border-zinc-200 text-zinc-600 p-4 text-xs font-mono rounded-2xl flex justify-between items-center shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-black shrink-0" />
              <div>{successMsg}</div>
            </div>
            <button onClick={() => setSuccessMsg('')} className="text-zinc-400 hover:text-black font-mono text-sm px-2">×</button>
          </div>
        )}

        {/* ==========================================
            STUDENT DASHBOARD
            ========================================== */}
        {user.role === 'student' && (
          <div className="space-y-8">
            
            {/* Header banner */}
            <div className="premium-card p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-[9px] font-bold font-mono tracking-widest bg-zinc-100 text-black px-2 py-0.5 rounded uppercase">
                  Active Cycle: {CYCLES.find(c => c.id === selectedCycle)?.name || selectedCycle}
                </span>
                <h2 className="text-xl font-extrabold tracking-tight text-zinc-900 mt-2 uppercase font-sans">student dashboard</h2>
                <p className="text-xs text-zinc-500 font-light mt-0.5">Participate daily to earn leaderboard points and win showcase trophies.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                <div>
                  <label className="block text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Select Cycle</label>
                  <select
                    value={selectedCycle}
                    onChange={(e) => setSelectedCycle(e.target.value)}
                    className="bg-zinc-50 border border-zinc-200 text-xs text-black font-mono font-bold px-3 rounded-lg focus:outline-none focus:border-black cursor-pointer h-[38px] flex items-center"
                  >
                    {CYCLES.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <span className="px-4 bg-black text-white text-xs font-mono font-bold uppercase rounded-lg text-center select-none shrink-0 h-[38px] flex items-center justify-center">Student Portal</span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="bg-gradient-to-br from-violet-50 via-purple-50/70 to-pink-50/30 border border-violet-100 hover:border-violet-300 hover:shadow-lg hover:shadow-purple-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-violet-700 uppercase">Current title</p>
                  <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
                    <Award className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-md font-bold tracking-tight text-violet-950 mt-2 font-sans truncate uppercase">{studentMetrics.title}</h3>
                <div className="flex flex-wrap gap-1 mt-3">
                  {studentMetrics.badges.map((b, i) => (
                    <span key={i} className="text-[9px] font-mono bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-2 py-0.5 font-bold tracking-wide rounded-md shadow-xs">{b}</span>
                  ))}
                  {studentMetrics.badges.length === 0 && (
                    <span className="text-[9px] font-mono text-violet-400">No custom awards yet</span>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 via-teal-50/70 to-cyan-50/30 border border-emerald-100 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-emerald-700 uppercase">Club Points</p>
                  <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                    <Trophy className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <h3 className="text-3xl font-black tracking-tight text-emerald-950 font-mono">{studentMetrics.total_points}</h3>
                  <span className="text-xs text-emerald-650 font-mono font-bold">pts</span>
                </div>
                <div className="text-[10px] font-mono text-emerald-600/80 mt-3 flex items-center justify-between border-t border-emerald-100/50 pt-2">
                  <span>Critique: <strong className="text-emerald-900">+{studentMetrics.feedback_points}</strong></span>
                  <span>Extra: <strong className="text-emerald-900">+{studentMetrics.manual_bonus}</strong></span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 via-sky-50/70 to-indigo-50/30 border border-blue-100 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-blue-700 uppercase">Days Submitted</p>
                  <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <h3 className="text-3xl font-black tracking-tight text-blue-950 font-mono">{studentMetrics.total_posts}</h3>
                  <span className="text-xs text-blue-650 font-mono font-bold">/ {cycleDays.length} days</span>
                </div>
                <div className="text-[10px] font-mono text-blue-600/80 mt-3 border-t border-blue-100/50 pt-2">
                  <span>Daily post progression</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 via-yellow-50/70 to-orange-50/30 border border-amber-100 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-amber-700 uppercase">Club Rank</p>
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                    <Star className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <h3 className="text-3xl font-black tracking-tight text-amber-950 font-mono">#{studentMetrics.rank || '-'}</h3>
                  <span className="text-xs text-amber-650 font-mono font-bold">overall</span>
                </div>
                <div className="text-[10px] font-mono text-amber-600/80 mt-3 border-t border-amber-100/50 pt-2">
                  <span>Out of {leaderboard.length} active students</span>
                </div>
              </div>

            </div>

            {/* Today's Announced Task Panel */}
            {activeTodayTopic && (
              <div className="premium-card p-6 bg-gradient-to-tr from-yellow-50/20 via-red-50/15 to-purple-50/25 border border-pink-200 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-start">
                    <div className="p-3.5 bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 text-white rounded-2xl shadow-md mr-4 shrink-0 flex items-center justify-center select-none animate-pulse">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                      </svg>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <span className="text-[9px] font-bold font-mono tracking-widest bg-gradient-to-r from-pink-500 to-purple-600 text-white px-2 py-0.5 rounded uppercase">
                        Today's Task • Day {getCurrentDayNumber(selectedCycle)}
                      </span>
                      <h3 className="text-base font-bold text-black font-mono uppercase mt-2">{activeTodayTopic.title}</h3>
                      <p className="text-xs text-zinc-650 font-mono leading-relaxed mt-1 max-w-2xl">{activeTodayTopic.desc}</p>
                    </div>
                  </div>
                  
                  <div className="shrink-0 font-mono">
                    {(() => {
                      const currentDayNum = getCurrentDayNumber(selectedCycle);
                      const state = submissionTracker[currentDayNum];
                      const isSubmitted = state === 'task' || state === 'meme' || state === 'both';
                      const dayUpload = studentUploads.find(u => u.day_number === currentDayNum);

                      if (isSubmitted) {
                        return (
                          <div className="flex flex-col items-end gap-2">
                            <span className="bg-green-150 border border-green-300 text-green-800 text-[10px] font-bold rounded-lg px-3 py-1.5 uppercase tracking-wide">
                              ✅ Completed
                            </span>
                            {dayUpload && (
                              <button
                                onClick={() => setViewingSubmission(dayUpload)}
                                className="text-[9px] text-indigo-600 hover:text-indigo-850 underline font-bold cursor-pointer transition-colors"
                              >
                                View My Submission
                              </button>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <button
                            onClick={() => {
                              setSelectedDayNumber(currentDayNum);
                              setUploadTopic(activeTodayTopic.title);
                              setUploadType('task');
                              setUploadTool('');
                              setUploadTime(30);
                              setUploadModalOpen(true);
                            }}
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>🚀</span> Submit Today's Task
                          </button>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* SVG Progress Graph + Points cheat-sheet split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              <div className="lg:col-span-2 premium-card p-6 flex flex-col justify-between">
                <div className="mb-4">
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Performance Graph</h3>
                  <p className="text-xs text-zinc-400 font-light mt-0.5">Your cumulative points trajectory over the planner schedule</p>
                </div>
                <div className="h-56">
                  {renderSvgGraph(studentGraphData, cycleDays.length)}
                </div>
              </div>

              <div className="premium-card p-6 flex flex-col justify-between font-mono text-xs">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-black mb-4 border-b border-zinc-200 pb-2">SCORE MULTIPLIERS</h3>
                  <ul className="space-y-2.5 text-[11px] text-zinc-500">
                    <li className="flex justify-between border-b border-zinc-100 pb-1.5">
                      <span>Post Design Task (on time)</span>
                      <span className="text-black font-bold">+5 pts</span>
                    </li>
                    <li className="flex justify-between border-b border-zinc-100 pb-1.5">
                      <span>Post Meme Graphic (on time)</span>
                      <span className="text-black font-bold">+3 pts</span>
                    </li>
                    <li className="flex justify-between border-b border-zinc-100 pb-1.5">
                      <span>Post BOTH (Task + Meme)</span>
                      <span className="text-black font-bold">+10 pts</span>
                    </li>
                    <li className="flex justify-between border-b border-zinc-100 pb-1.5">
                      <span>Showcase Saturday Top 3</span>
                      <span className="text-black font-bold">+15 pts</span>
                    </li>
                    <li className="flex justify-between border-b border-zinc-100 pb-1.5">
                      <span>Showcase Saturday #1 Win</span>
                      <span className="text-black font-bold">+25 pts</span>
                    </li>
                    <li className="flex justify-between border-b border-zinc-100 pb-1.5">
                      <span>Give peer critique (max 3/day)</span>
                      <span className="text-black font-bold">+2 pts</span>
                    </li>
                    <li className="flex justify-between pb-1">
                      <span>Late Submissions (next day)</span>
                      <span className="text-zinc-400 font-bold">+2 pts</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 p-3 mt-4 text-[10px] text-zinc-500 rounded-xl leading-relaxed">
                  <p>💬 <span className="font-bold text-black font-mono">PEER FEEDBACK RULE:</span> Post your work on the club WhatsApp/Discord group, and write helpful critiques using: <span className="font-bold">"I like... I wish... What if..."</span>.</p>
                </div>
              </div>

            </div>

            {/* Daily Calendar Grid */}
            <div className="premium-card p-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-zinc-150 pb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-black font-mono">Activity Grid</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Click any day tile to submit your daily task or meme.</p>
                </div>
                <div className="flex gap-4 font-mono text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-zinc-200 bg-white rounded"></span> Pending</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-orange-100 border border-orange-200 rounded"></span> Task/Meme</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-green-100 border border-green-250 rounded"></span> Both Submitted</span>
                </div>
              </div>

              {/* Daily days mapping */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-4">
                {cycleDays.map((dayObj) => {
                  const state = submissionTracker[dayObj.day];
                  const dayUpload = studentUploads.find(u => u.day_number === dayObj.day);
                  
                  let tileStyle = "bg-white border border-zinc-200 hover:border-zinc-400 text-zinc-850 hover:bg-zinc-50/30";
                  if (state === 'both') {
                    tileStyle = "bg-green-100 border border-green-300 text-green-950 hover:border-green-500";
                  } else if (state === 'task' || state === 'meme') {
                    tileStyle = "bg-orange-100 border border-orange-300 text-orange-950 hover:border-orange-500";
                  }

                  return (
                    <div 
                      key={dayObj.day}
                      onClick={() => {
                        setSelectedDayNumber(dayObj.day);
                        if (dayUpload) {
                          setViewingSubmission(dayUpload);
                        } else {
                          setUploadTopic('');
                          setUploadType('task');
                          setUploadTool('');
                          setUploadTime(30);
                          setUploadModalOpen(true);
                        }
                      }}
                      className={`h-28 flex flex-col justify-between p-3 cursor-pointer shadow-xs hover:shadow-sm transform hover:-translate-y-0.5 transition-all rounded-xl ${tileStyle}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono font-bold">Day {dayObj.day}</span>
                        <span className="text-[9px] font-mono opacity-60">
                          {dayObj.dayName.substring(0, 3)}
                        </span>
                      </div>
                      
                      <div className="my-1">
                        {dayUpload ? (
                          <>
                            <h4 className="text-[10px] font-bold truncate tracking-wide uppercase">
                              {dayUpload.topic}
                            </h4>
                            {/* Showcase Badge inside Grid Cell */}
                            {(dayUpload.showcase_award === 'win1' || dayUpload.points_breakdown?.showcase_bonus === 25) && (
                              <div className="text-[8px] font-mono font-bold text-yellow-850 bg-yellow-100/90 border border-yellow-300/90 px-1 rounded flex items-center gap-0.5 mt-0.5 w-max animate-pulse">
                                <span>👑 {getShowcaseWinnerShortTitle(dayUpload.day_number)} 🏆</span>
                              </div>
                            )}
                          </>
                        ) : null}
                        <span className="text-[9px] opacity-65 font-mono">
                          {formatDateShort(dayObj.date)}
                        </span>
                      </div>

                      <div className="border-t border-current/10 pt-1 flex items-center justify-between text-[9px] font-mono font-bold">
                        {state ? (
                          <span className="uppercase tracking-widest text-[8px] flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5 shrink-0" /> {state}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 opacity-70 text-[8px]">
                            <Plus className="w-2.5 h-2.5" /> SUBMIT NOW
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Submission Log */}
            <div className="premium-card p-6">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black mb-6 border-b border-zinc-150 pb-3">My Submission Gallery</h3>
              
              {studentUploads.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 font-mono text-xs">
                  No submissions uploaded yet. Choose an active day block above to submit.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {studentUploads.map((upload) => (
                    <div key={upload._id} className="premium-card overflow-hidden flex flex-col justify-between">
                      
                      {/* Image block */}
                      <div className="relative group/img h-32 w-full bg-zinc-50 border-b border-zinc-200 overflow-hidden">
                        {upload.image_meme_url ? (
                          <div className="grid grid-cols-2 h-full w-full divide-x divide-zinc-200">
                            <div className="relative h-full w-full overflow-hidden">
                              <img 
                                src={api.getImageUrl(upload.image_url)} 
                                alt={upload.topic}
                                className="w-full h-full object-cover hover:scale-103 transition-transform duration-300 cursor-pointer"
                                onClick={() => setZoomedImage(api.getImageUrl(upload.image_url))}
                              />
                            </div>
                            <div className="relative h-full w-full overflow-hidden">
                              <img 
                                src={api.getImageUrl(upload.image_meme_url)} 
                                alt="Meme graphic"
                                className="w-full h-full object-cover hover:scale-103 transition-transform duration-300 cursor-pointer"
                                onClick={() => setZoomedImage(api.getImageUrl(upload.image_meme_url))}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <img 
                              src={api.getImageUrl(upload.image_url)} 
                              alt={upload.topic}
                              className="w-full h-full object-cover group-hover/img:scale-103 transition-transform duration-300"
                            />
                            <div 
                              onClick={() => setZoomedImage(api.getImageUrl(upload.image_url))}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                            >
                              <Eye className="w-5 h-5 text-white" />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Info details */}
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 mb-1.5">
                            <span>Day {upload.day_number} | {formatDateLabel(upload.date)}</span>
                            <span className={`px-2 py-0.2 rounded font-bold uppercase text-[8px] ${upload.type === 'both' ? 'bg-black text-white' : 'bg-zinc-100 text-black border border-zinc-250'}`}>
                              {upload.type}
                            </span>
                          </div>
                          
                          {/* Showcase Award Congratulations Badge */}
                          {(upload.showcase_award === 'win1' || upload.points_breakdown?.showcase_bonus === 25) && (
                            <div className="mb-2 bg-yellow-100 border border-yellow-350 text-yellow-850 text-[9px] font-bold font-mono px-2 py-1 rounded-lg flex items-center gap-1 animate-pulse w-max">
                              <span>👑 {getShowcaseWinnerTitle(upload.day_number)} Congratulations! 🏆</span>
                            </div>
                          )}
                          {upload.is_insta_pick && (
                            <div className="mb-2 bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 text-white text-[9px] font-bold font-mono px-2 py-1 rounded-lg flex items-center gap-1 w-max">
                              <span>📸 Picked for Instagram ({upload.insta_pick_type === 'meme' ? 'Meme' : 'Design'})!</span>
                            </div>
                          )}

                          <h4 className="text-xs font-bold text-black uppercase mb-1.5 truncate">{upload.topic}</h4>
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400 border-b border-zinc-100 pb-2.5 mb-3">
                            <span>Tool: <span className="text-black font-bold">{upload.tool_used}</span></span>
                            <span>Time: <span className="text-black font-bold">{upload.time_taken} mins</span></span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-zinc-400">Score Earned:</span>
                            <span className="font-bold text-black bg-zinc-50 border border-zinc-250 px-2 py-0.5 rounded">
                              +{upload.points_awarded} pts
                            </span>
                          </div>
                          
                          {upload.status === 'reviewed' && upload.feedback && (
                            <div className="bg-zinc-50 border-l border-black p-3 text-[10px] text-zinc-600 font-mono rounded-r-lg mt-2">
                              <span className="text-[9px] text-zinc-400 block font-bold uppercase mb-0.5">Critique Feedback:</span>
                              <p className="whitespace-pre-line leading-relaxed">{upload.feedback}</p>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            COORDINATOR PORTAL
            ========================================== */}
        {user.role === 'leader' && (
          <div className="space-y-10">
            
            {/* Header banner */}
            <div className="premium-card p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-[9px] font-bold font-mono tracking-widest bg-zinc-100 text-black px-2 py-0.5 rounded uppercase">
                  Active Cycle: {CYCLES.find(c => c.id === selectedCycle)?.name || selectedCycle}
                </span>
                <h2 className="text-xl font-extrabold tracking-tight text-zinc-900 mt-2 uppercase font-sans">Coordinator Dashboard</h2>
                <p className="text-xs text-zinc-500 font-light mt-0.5">Manage students, review uploads, allocate showcase awards, and adjust critique comments.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                <div>
                  <label className="block text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Select Cycle</label>
                  <select
                    value={selectedCycle}
                    onChange={(e) => setSelectedCycle(e.target.value)}
                    className="bg-zinc-50 border border-zinc-200 text-xs text-black font-mono font-bold px-3 rounded-lg focus:outline-none focus:border-black cursor-pointer h-[38px] flex items-center"
                  >
                    {CYCLES.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <span className="px-4 bg-black text-white text-xs font-mono font-bold uppercase rounded-lg text-center select-none shrink-0 h-[38px] flex items-center justify-center">Admin Mode</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="bg-gradient-to-br from-indigo-50 via-slate-50/70 to-blue-50/30 border border-indigo-100 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-indigo-700 uppercase">Total Active Students</p>
                  <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                    <User className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-3xl font-black tracking-tight text-indigo-950 font-mono mt-2">{adminStudents.length}</h3>
                <span className="text-[10px] font-mono text-indigo-600/80 block mt-3 border-t border-indigo-100/50 pt-2">Registered student counts</span>
              </div>

              <div className="bg-gradient-to-br from-violet-50 via-purple-50/70 to-pink-50/30 border border-violet-100 hover:border-violet-300 hover:shadow-lg hover:shadow-purple-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-purple-700 uppercase">Total Submissions</p>
                  <div className="p-2 bg-purple-100 rounded-xl text-purple-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-3xl font-black tracking-tight text-purple-950 font-mono mt-2">{adminUploads.length}</h3>
                <span className="text-[10px] font-mono text-purple-600/80 block mt-3 border-t border-purple-100/50 pt-2">Tasks & memes uploaded</span>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 via-teal-50/70 to-cyan-50/30 border border-emerald-100 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-emerald-700 uppercase">Total Points Allocated</p>
                  <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                    <Trophy className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-3xl font-black tracking-tight text-emerald-950 font-mono mt-2">
                  {adminStudents.reduce((acc, curr) => acc + (curr.points || 0), 0)}
                </h3>
                <span className="text-[10px] font-mono text-emerald-600/80 block mt-3 border-t border-emerald-100/50 pt-2">Cumulative database points</span>
              </div>

              <div className="bg-gradient-to-br from-amber-50 via-yellow-50/70 to-orange-50/30 border border-amber-100 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-100/50 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold font-mono tracking-widest text-amber-700 uppercase">Top Designer</p>
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                    <Star className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-md font-bold text-amber-950 truncate mt-3 uppercase">
                  {leaderboard[0] ? leaderboard[0].name : "None"}
                </h3>
                <span className="text-[10px] font-mono text-amber-600/80 block mt-2 border-t border-amber-100/50 pt-2">Rank #1 with {leaderboard[0] ? leaderboard[0].points : 0} pts</span>
              </div>

            </div>

            {/* Coordinator Tab Switcher */}
            <div className="flex border-b border-zinc-200 gap-1">
              <button
                type="button"
                onClick={() => setCoordinatorTab('submissions')}
                className={`py-3 px-6 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-all cursor-pointer ${
                  coordinatorTab === 'submissions'
                    ? 'border-black text-black'
                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                }`}
              >
                📋 Submissions & Leaderboard
              </button>
              <button
                type="button"
                onClick={() => setCoordinatorTab('polls')}
                className={`py-3 px-6 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-all cursor-pointer ${
                  coordinatorTab === 'polls'
                    ? 'border-black text-black'
                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                }`}
              >
                🗳️ Weekly Saturday Polls
              </button>
              <button
                type="button"
                onClick={() => setCoordinatorTab('insights')}
                className={`py-3 px-6 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-all cursor-pointer ${
                  coordinatorTab === 'insights'
                    ? 'border-black text-black'
                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                }`}
              >
                📊 Insights & Graphs
              </button>
              <button
                type="button"
                onClick={() => setCoordinatorTab('daily-tasks')}
                className={`py-3 px-6 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-all cursor-pointer ${
                  coordinatorTab === 'daily-tasks'
                    ? 'border-black text-black'
                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                }`}
              >
                📅 Daily Tasks Plan
              </button>
            </div>

            {coordinatorTab === 'submissions' && (
              <>
                {/* Daily Task Completion Tracker */}
                <div className="premium-card p-6 mb-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-200">
                    <div>
                      <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black flex items-center gap-2">
                        <span>📋</span> Today's Task Completion Tracker (Day {getCurrentDayNumber(selectedCycle)})
                      </h3>
                      {(() => {
                        const currentDayNum = getCurrentDayNumber(selectedCycle);
                        const todayTopic = topics.find(t => t.day === currentDayNum);
                        if (todayTopic && todayTopic.announced) {
                          return (
                            <p className="text-xs text-indigo-650 font-bold mt-1 font-mono">
                              Active Task: "{todayTopic.title}"
                            </p>
                          );
                        } else {
                          return (
                            <p className="text-xs text-zinc-400 font-light mt-0.5">
                              No task has been announced for today yet. Use the "Daily Tasks Plan" tab to announce it.
                            </p>
                          );
                        }
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[220px] overflow-y-auto pr-1">
                    {adminStudents.map((student) => {
                      const currentDayNum = getCurrentDayNumber(selectedCycle);
                      const dayUpload = adminUploads.find(u => 
                        String(u.student_id) === String(student.id) &&
                        u.day_number === currentDayNum
                      );
                      
                      return (
                        <div key={student.id} className="bg-zinc-50 border border-zinc-200 p-3 rounded-xl flex items-center justify-between gap-3 font-mono text-[10px] select-none hover:bg-zinc-100/50 transition-colors">
                          <div className="min-w-0">
                            <span className="block text-black font-bold truncate uppercase">{student.name}</span>
                            <span className="block text-zinc-400 truncate text-[9px] uppercase mt-0.5">{student.college_name}</span>
                          </div>
                          <div className="shrink-0">
                            {dayUpload ? (
                              <button
                                onClick={() => handleOpenReview(dayUpload)}
                                className="bg-green-100 hover:bg-green-200 border border-green-300 text-green-800 text-[8px] font-bold rounded-lg px-2 py-1 uppercase tracking-wide cursor-pointer transition-colors"
                              >
                                ✅ Submitted
                              </button>
                            ) : (
                              <span className="bg-red-50 border border-red-200 text-red-700 text-[8px] font-bold rounded-lg px-2 py-1 uppercase tracking-wide block">
                                ❌ Pending
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {adminStudents.length === 0 && (
                      <div className="col-span-full text-center py-6 text-zinc-450 font-mono text-xs">
                        No registered students found in this cycle.
                      </div>
                    )}
                  </div>
                </div>

                {/* Split panels */}
                <div className="premium-card p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-200">
                    <div>
                      <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Student Leaderboard Tracker</h3>
                      <p className="text-xs text-zinc-400 font-light mt-0.5">Ranked student index list</p>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input 
                        type="text"
                        value={leaderboardSearch}
                        onChange={(e) => setLeaderboardSearch(e.target.value)}
                        placeholder="Search name or college..."
                        className="bg-zinc-50 border border-zinc-200 pl-9 pr-4 py-1.5 text-xs text-black focus:outline-none focus:border-black font-mono rounded-lg w-52"
                      />
                    </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs select-none">
                  <thead>
                    <tr className="border-b border-zinc-150 text-zinc-400 uppercase text-[9px] tracking-wider">
                      <th className="py-2.5 px-2 text-center w-12 font-bold">Rank</th>
                      <th className="py-2.5 px-4 font-bold">Student Name</th>
                      <th className="py-2.5 px-4 font-bold">College</th>
                      <th className="py-2.5 px-3 text-center w-20 font-bold">Points</th>
                      <th className="py-2.5 px-4 font-bold">Title badge</th>
                      <th className="py-2.5 px-2 text-center w-20 font-bold">Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {leaderboard
                      .filter(s => 
                        s.name.toLowerCase().includes(leaderboardSearch.toLowerCase()) ||
                        s.college_name.toLowerCase().includes(leaderboardSearch.toLowerCase())
                      )
                      .map((student) => {
                        let rankStyle = "text-zinc-500 font-bold";
                        if (student.rank === 1) rankStyle = "text-yellow-600 font-extrabold";
                        else if (student.rank === 2) rankStyle = "text-zinc-650 font-extrabold";
                        else if (student.rank === 3) rankStyle = "text-amber-700 font-extrabold";

                        return (
                          <tr key={student.id} className="hover:bg-zinc-50 group">
                            <td className={`py-4 px-2 text-center font-mono ${rankStyle}`}>
                              #{student.rank}
                            </td>
                            <td className="py-4 px-4 font-sans font-bold text-black">
                              {student.name}
                            </td>
                            <td className="py-4 px-4 text-zinc-500">
                              <span className="block text-[11px] truncate max-w-[250px]">{student.college_name}</span>
                              <span className="text-[9px] text-zinc-400">Class {student.passout_year}</span>
                            </td>
                            <td className="py-4 px-3 text-center font-bold font-mono text-black">
                              {student.points}
                            </td>
                            <td className="py-4 px-4 text-black text-[11px]">
                              <span className="font-bold border border-zinc-200 bg-zinc-50 px-2 py-0.5 rounded-lg uppercase text-[9px]">
                                {student.title.replace(/🥇 |🥈 |🥉 /, "")}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {student.badges.map((b, i) => (
                                  <span key={i} className="text-[8px] font-bold bg-black text-white px-1.5 py-0.2 rounded font-mono uppercase shrink-0">{b}</span>
                                ))}
                              </div>
                            </td>
                            <td className="py-4 px-2 text-center">
                              <button 
                                onClick={() => handleOpenStudentDetail(student.id)}
                                className="p-1.5 border border-zinc-200 hover:border-black text-zinc-400 hover:text-black rounded-lg transition-colors inline-block cursor-pointer"
                                title="Analyze Profile"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                
                {leaderboard.length === 0 && (
                  <div className="text-center py-10 text-zinc-400 font-mono">No students indexes populated yet.</div>
                )}
              </div>
            </div>

            {/* Verification Feed */}
            <div className="premium-card p-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-zinc-150 pb-4">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Uploads Verification Grid</h3>
                  <p className="text-xs text-zinc-400 font-light mt-0.5">Evaluate task uploads, manage points multipliers, and write critique feedback</p>
                </div>
                
                {/* Filters selector */}
                <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input 
                      type="text"
                      placeholder="Filter student..."
                      value={uploadsSearch}
                      onChange={(e) => setUploadsSearch(e.target.value)}
                      className="bg-zinc-50 border border-zinc-200 pl-8 pr-3 py-1.5 text-xs text-black focus:outline-none focus:border-black font-mono rounded-lg w-40"
                    />
                  </div>
                  
                  <div className="border border-zinc-200 bg-zinc-50 p-0.5 flex rounded-lg">
                    <button 
                      onClick={() => setUploadsFilter('all')}
                      className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md cursor-pointer ${uploadsFilter === 'all' ? 'bg-black text-white shadow-xs' : 'text-zinc-500 hover:text-black'}`}
                    >
                      All
                    </button>
                    <button 
                      onClick={() => setUploadsFilter('pending')}
                      className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md cursor-pointer ${uploadsFilter === 'pending' ? 'bg-black text-white shadow-xs' : 'text-zinc-500 hover:text-black'}`}
                    >
                      Pending
                    </button>
                    <button 
                      onClick={() => setUploadsFilter('reviewed')}
                      className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md cursor-pointer ${uploadsFilter === 'reviewed' ? 'bg-black text-white shadow-xs' : 'text-zinc-500 hover:text-black'}`}
                    >
                      Reviewed
                    </button>
                  </div>
                </div>
              </div>

              {adminUploads.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 font-mono text-xs">
                  No submissions uploaded by students yet.
                </div>
              ) : (
                <div className="max-h-[820px] overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {adminUploads
                      .filter(u => {
                        if (uploadsFilter === 'pending') return u.status === 'pending';
                        if (uploadsFilter === 'reviewed') return u.status === 'reviewed';
                        return true;
                      })
                      .filter(u => u.student_name.toLowerCase().includes(uploadsSearch.toLowerCase()))
                      .sort((a, b) => {
                        const dateA = a.submitted_at ? new Date(a.submitted_at) : new Date(0);
                        const dateB = b.submitted_at ? new Date(b.submitted_at) : new Date(0);
                        if (dateB - dateA !== 0) return dateB - dateA;
                        return b.day_number - a.day_number;
                      })
                      .map((upload) => (
                        <div key={upload._id} className="premium-card overflow-hidden flex flex-col justify-between">
                          
                          <div>
                            <div className="relative group/img h-44 w-full bg-zinc-50 border-b border-zinc-200 overflow-hidden">
                              {upload.image_meme_url ? (
                                <div className="grid grid-cols-2 h-full w-full divide-x divide-zinc-200">
                                  <div className="relative h-full w-full overflow-hidden">
                                    <img 
                                      src={api.getImageUrl(upload.image_url)} 
                                      alt={upload.topic}
                                      className="w-full h-full object-cover hover:scale-103 transition-transform duration-300 cursor-pointer"
                                      onClick={() => setZoomedImage(api.getImageUrl(upload.image_url))}
                                    />
                                  </div>
                                  <div className="relative h-full w-full overflow-hidden">
                                    <img 
                                      src={api.getImageUrl(upload.image_meme_url)} 
                                      alt="Meme graphic"
                                      className="w-full h-full object-cover hover:scale-103 transition-transform duration-300 cursor-pointer"
                                      onClick={() => setZoomedImage(api.getImageUrl(upload.image_meme_url))}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <img 
                                    src={api.getImageUrl(upload.image_url)} 
                                    alt={upload.topic}
                                    className="w-full h-full object-cover group-hover/img:scale-103 transition-transform duration-300"
                                  />
                                  <div 
                                    onClick={() => setZoomedImage(api.getImageUrl(upload.image_url))}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                                  >
                                    <Eye className="w-5 h-5 text-white" />
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="p-4">
                              <div className="flex justify-between items-start text-[10px] font-mono text-zinc-400 mb-1.5">
                                <span>Day {upload.day_number} | {upload.student_name}</span>
                                <span className={`px-2 py-0.2 rounded font-bold uppercase text-[8px] ${upload.type === 'both' ? 'bg-black text-white' : 'bg-zinc-100 text-black border border-zinc-200'}`}>
                                  {upload.type}
                                </span>
                              </div>
                              
                              {/* Showcase Award Badge */}
                              {(upload.showcase_award === 'win1' || upload.points_breakdown?.showcase_bonus === 25) && (
                                <div className="mb-2 bg-yellow-100 border border-yellow-350 text-yellow-800 text-[9px] font-bold font-mono px-2 py-0.5 rounded-lg flex items-center gap-1 w-max">
                                  <span>👑 {getShowcaseWinnerTitle(upload.day_number)} 🏆</span>
                                </div>
                              )}
                              {upload.is_insta_pick && (
                                <div className="mb-2 bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 text-white text-[9px] font-bold font-mono px-2 py-0.5 rounded-lg flex items-center gap-1 w-max">
                                  <span>📸 INSTA PICK ({upload.insta_pick_type === 'meme' ? 'MEME' : 'DESIGN'})</span>
                                </div>
                              )}

                              <h4 className="text-xs font-bold text-black uppercase truncate mb-1">{upload.topic}</h4>
                              <div className="text-[10px] font-mono mb-3 uppercase">
                                <div className="text-black font-bold">Uploaded By: {upload.student_name}</div>
                                <div className="text-zinc-450 text-[9px] mt-0.5">College: {upload.college_name}</div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400 border-b border-zinc-100 pb-2.5 mb-1.5">
                                <span>Tool: <span className="text-black font-bold">{upload.tool_used}</span></span>
                                <span>Time: <span className="text-black font-bold">{upload.time_taken}m</span></span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 pt-0">
                            <div className="flex justify-between items-center text-xs font-mono mb-4">
                              <span className="text-zinc-455">Points awarded:</span>
                              <span className="font-bold text-black bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded">
                                +{upload.points_awarded} pts {upload.is_late && <span className="text-[9px] text-red-500 font-bold ml-1">LATE</span>}
                              </span>
                            </div>

                            {upload.type === 'both' ? (
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const res = await api.pickInsta(upload._id, 'task');
                                      if (res && !res.error) {
                                        setAdminUploads(prev => prev.map(u => u._id === upload._id ? { ...u, is_insta_pick: res.is_insta_pick, insta_pick_type: res.insta_pick_type } : u));
                                        const picksRes = await api.getInstaPicks(selectedCycle);
                                        if (picksRes && !picksRes.error) {
                                          setInstaPicks(picksRes);
                                        }
                                      }
                                    } catch (err) {
                                      console.error("Error picking for Insta:", err);
                                    }
                                  }}
                                  className={`py-2 text-[10px] uppercase font-mono border rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                                    upload.is_insta_pick && upload.insta_pick_type === 'task'
                                      ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 text-white border-transparent shadow-xs'
                                      : 'bg-white border-zinc-200 text-zinc-650 hover:border-black'
                                  }`}
                                >
                                  <span>📸 Design</span>
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const res = await api.pickInsta(upload._id, 'meme');
                                      if (res && !res.error) {
                                        setAdminUploads(prev => prev.map(u => u._id === upload._id ? { ...u, is_insta_pick: res.is_insta_pick, insta_pick_type: res.insta_pick_type } : u));
                                        const picksRes = await api.getInstaPicks(selectedCycle);
                                        if (picksRes && !picksRes.error) {
                                          setInstaPicks(picksRes);
                                        }
                                      }
                                    } catch (err) {
                                      console.error("Error picking for Insta:", err);
                                    }
                                  }}
                                  className={`py-2 text-[10px] uppercase font-mono border rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                                    upload.is_insta_pick && upload.insta_pick_type === 'meme'
                                      ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 text-white border-transparent shadow-xs'
                                      : 'bg-white border-zinc-200 text-zinc-655 hover:border-black'
                                  }`}
                                >
                                  <span>📸 Meme</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await api.pickInsta(upload._id, upload.type);
                                    if (res && !res.error) {
                                      setAdminUploads(prev => prev.map(u => u._id === upload._id ? { ...u, is_insta_pick: res.is_insta_pick, insta_pick_type: res.insta_pick_type } : u));
                                      const picksRes = await api.getInstaPicks(selectedCycle);
                                      if (picksRes && !picksRes.error) {
                                        setInstaPicks(picksRes);
                                      }
                                    }
                                  } catch (err) {
                                    console.error("Error picking for Insta:", err);
                                  }
                                }}
                                className={`w-full py-2 text-xs uppercase font-mono mb-2 border rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  upload.is_insta_pick
                                    ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 text-white border-transparent'
                                    : 'bg-white border-zinc-200 text-zinc-600 hover:border-black'
                                }`}
                              >
                                <span>📸</span>
                                <span>{upload.is_insta_pick ? 'Instagram Picked' : 'Pick for Insta'}</span>
                              </button>
                            )}

                            {upload.status === 'reviewed' ? (
                              <div className="space-y-3">
                                <button 
                                  onClick={() => handleOpenReview(upload)}
                                  className="w-full premium-btn-outline py-2 text-xs uppercase font-mono"
                                >
                                  Re-evaluate Upload
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => handleOpenReview(upload)}
                                className="w-full premium-btn-black py-2.5 text-xs uppercase font-mono"
                              >
                                Verify & Score
                              </button>
                            )}
                          </div>

                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {coordinatorTab === 'polls' && (
          <div className="space-y-8 animate-fade-in">
            {/* 1. Active Poll Status / Controls */}
            <div className="premium-card p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-zinc-200">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Active Poll Controller</h3>
                  <p className="text-xs text-zinc-400 font-light mt-0.5">Publish weekly Saturday polls and check live results progress.</p>
                </div>
                <div>
                  {activePollAdmin ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Are you sure you want to end this poll now? Points and showcase awards will be allocated automatically based on current votes.")) return;
                        setLoading(true);
                        setErrorMsg('');
                        try {
                          const res = await api.endPoll(activePollAdmin._id);
                          if (res && res.error) {
                            setErrorMsg(res.error);
                          } else {
                            setSuccessMsg("Poll ended and showcase points allocated successfully!");
                            await loadDashboardData(selectedCycle);
                          }
                        } catch (err) {
                          setErrorMsg("Failed to end the poll. Please check server.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="bg-black hover:bg-zinc-800 text-white text-xs font-mono font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm animate-fade-in"
                    >
                      <span>🛑 Force Close Poll</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={instaPicks.length === 0 || loading}
                      onClick={async () => {
                        setLoading(true);
                        setErrorMsg('');
                        try {
                          const res = await api.createPoll(selectedCycle);
                          if (res && res.error) {
                            setErrorMsg(res.error);
                          } else {
                            setSuccessMsg("Weekly Saturday Showcase Poll posted successfully!");
                            await loadDashboardData(selectedCycle);
                          }
                        } catch (err) {
                          setErrorMsg("Failed to post poll. Make sure you have picked posts first.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className={`text-xs font-mono font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all uppercase ${
                        instaPicks.length === 0
                          ? 'bg-zinc-100 border border-zinc-200 text-zinc-400 cursor-not-allowed'
                          : 'bg-black text-white hover:bg-zinc-800 cursor-pointer shadow-md'
                      }`}
                    >
                      <span>🗳️ Post Weekly Saturday Poll</span>
                    </button>
                  )}
                </div>
              </div>

              {activePollAdmin ? (
                <div className="space-y-6">
                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="font-mono text-xs">
                      <div className="font-bold flex items-center gap-1.5 uppercase text-[10px]">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                        <span className="text-yellow-800">Saturday Showcase Poll is Live</span>
                      </div>
                      <div className="text-zinc-600 mt-1">
                        Expires at: <span className="font-bold text-black">{new Date(activePollAdmin.expires_at).toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-zinc-450 mt-0.5 uppercase font-bold">
                        Total votes submitted: {activePollAdmin.voted_students?.length || 0}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono border border-yellow-250 bg-white text-yellow-800 px-2 py-0.5 rounded-lg uppercase tracking-wider select-none font-bold">Active</span>
                  </div>

                  {/* Options & Progress Bars */}
                  <div>
                    <h4 className="text-xs font-bold font-mono text-black uppercase mb-4 tracking-wider">Live Polling Vote Standings</h4>
                    
                    <div className="space-y-4 max-w-2xl">
                      {activePollAdmin.options?.map((option) => {
                        const totalVotes = activePollAdmin.options.reduce((sum, o) => sum + (o.votes || 0), 0);
                        const percent = totalVotes > 0 ? Math.round(((option.votes || 0) / totalVotes) * 100) : 0;
                        return (
                          <div key={option.upload_id} className="space-y-1">
                            <div className="flex justify-between text-[11px] font-mono">
                              <span className="text-black uppercase">
                                {option.topic} (<span className="font-bold">{option.student_name}</span>)
                              </span>
                              <span className="font-bold text-black">{option.votes || 0} votes ({percent}%)</span>
                            </div>
                            <div className="w-full bg-zinc-100 h-3 rounded-full overflow-hidden border border-zinc-200">
                              <div 
                                className="bg-black h-full transition-all duration-500 rounded-full"
                                style={{ width: `${percent}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 bg-zinc-50 border border-zinc-200/80 rounded-2xl">
                  <p className="text-xs font-mono text-zinc-400 uppercase select-none font-bold">No Saturday poll is currently active.</p>
                  {instaPicks.length > 0 ? (
                    <p className="text-[10px] font-mono text-zinc-500 mt-1 uppercase">Ready to launch with {instaPicks.length} picked designs!</p>
                  ) : (
                    <p className="text-[10px] font-mono text-zinc-500 mt-1 uppercase">Pick designs for Instagram from the submissions grid to initialize candidate list.</p>
                  )}
                </div>
              )}
            </div>

            {/* 2. Current Instagram Picks */}
            <div className="premium-card p-6">
              <div className="mb-6 border-b border-zinc-200 pb-4">
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Picked Designs for Instagram & Poll</h3>
                <p className="text-xs text-zinc-400 font-light mt-0.5">These designs are queued for Instagram posting and will populate the candidates list in the Saturday Poll.</p>
              </div>

              {instaPicks.length === 0 ? (
                <div className="text-center py-8 text-zinc-400 font-mono text-xs">
                  No designs have been picked for Instagram yet. Select "Pick for Insta" in the Submissions view.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {instaPicks.map((pick) => (
                    <div key={pick._id} className="premium-card overflow-hidden flex flex-col justify-between border border-zinc-200 hover:border-zinc-350">
                      <div>
                        <div className="relative group/img h-36 bg-zinc-50 border-b border-zinc-200 overflow-hidden">
                          <img 
                            src={api.getImageUrl(
                              pick.type === 'both' && pick.insta_pick_type === 'meme'
                                ? pick.image_meme_url
                                : pick.image_url
                            )} 
                            alt={pick.topic}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-center text-[9px] font-mono text-zinc-400 mb-1">
                            <span>Day {pick.day_number} | {pick.student_name}</span>
                            <span className="font-bold text-purple-600 uppercase text-[8px]">
                              {pick.insta_pick_type === 'meme' ? 'Meme' : 'Design'}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-black uppercase truncate mb-2">{pick.topic}</h4>
                        </div>
                      </div>
                      
                      <div className="p-4 pt-0">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await api.pickInsta(pick._id, pick.insta_pick_type);
                              if (res && !res.error) {
                                setInstaPicks(prev => prev.filter(p => p._id !== pick._id));
                                setAdminUploads(prev => prev.map(u => u._id === pick._id ? { ...u, is_insta_pick: false, insta_pick_type: null } : u));
                              }
                            } catch (err) {
                              console.error("Error unpicking for Insta:", err);
                            }
                          }}
                          className="w-full py-1.5 border border-zinc-200 hover:border-red-400 text-zinc-400 hover:text-red-500 rounded-lg font-mono text-[10px] uppercase transition-all cursor-pointer"
                        >
                          Remove from Poll Picks
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Past Polls History Log */}
            <div className="premium-card p-6">
              <div className="mb-6 border-b border-zinc-200 pb-4">
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Past Saturday Polls Log</h3>
                <p className="text-xs text-zinc-400 font-light mt-0.5">Archive of completed Saturday Showcase polls and final standings.</p>
              </div>

              {adminPolls.filter(p => p.status === 'ended').length === 0 ? (
                <div className="text-center py-8 text-zinc-400 font-mono text-xs">
                  No past polls archived in this cycle.
                </div>
              ) : (
                <div className="space-y-6">
                  {adminPolls
                    .filter(p => p.status === 'ended')
                    .map((poll) => {
                      const sortedOptions = [...poll.options].sort((a, b) => (b.votes || 0) - (a.votes || 0));
                      return (
                        <div key={poll._id} className="border border-zinc-200 p-5 rounded-2xl bg-zinc-50/50 space-y-4">
                          <div className="flex justify-between items-center text-xs font-mono border-b border-zinc-150 pb-2">
                            <span className="text-black font-bold uppercase">Poll Ended • Created: {new Date(poll.created_at).toLocaleDateString()}</span>
                            <span className="text-zinc-450 uppercase font-bold text-[10px]">Total Votes: {poll.voted_students?.length || 0}</span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {sortedOptions.slice(0, 1).map((opt) => {
                              const awardTitle = `👑 ${getShowcaseWinnerTitle(opt.day_number)}`;
                              const awardBadgeStyle = "bg-yellow-100 text-yellow-800 border-yellow-250 animate-pulse";
                              
                              return (
                                <div key={opt.upload_id} className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center gap-3">
                                  <div className="w-12 h-12 rounded overflow-hidden bg-zinc-100 shrink-0">
                                    <img 
                                      src={api.getImageUrl(opt.image_url)} 
                                      alt={opt.topic}
                                      className="w-full h-full object-cover cursor-zoom-in"
                                      onClick={() => setZoomedImage(api.getImageUrl(opt.image_url))}
                                    />
                                  </div>
                                  <div className="font-mono text-[10px] min-w-0 flex-1">
                                    <span className={`block font-bold px-1.5 py-0.2 rounded-lg text-[9px] w-max uppercase border ${awardBadgeStyle} mb-1`}>
                                      {awardTitle}
                                    </span>
                                    <span className="block text-black font-bold truncate uppercase">{opt.student_name}</span>
                                    <span className="block text-zinc-450 truncate uppercase mt-0.5">{opt.topic}</span>
                                    <span className="block text-black font-bold mt-0.5">{opt.votes || 0} votes</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {coordinatorTab === 'insights' && (
          <div className="space-y-8 animate-fade-in">
            
            {/* Control Bar */}
            <div className="premium-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Insights & Analytics Controls</h3>
                <p className="text-xs text-zinc-400 font-light mt-0.5">Filter data timeframe and send summary reports directly to your manager.</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Timeframe selector */}
                <div className="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
                  {['7days', '30days', '90days', 'all'].map((tf) => {
                    const label = tf === '7days' ? '7 Days' : tf === '30days' ? '30 Days' : tf === '90days' ? '90 Days' : 'All Time';
                    return (
                      <button
                        key={tf}
                        onClick={() => setStatsTimeframe(tf)}
                        className={`px-3 py-1 text-[10px] font-mono font-bold rounded-md uppercase transition-all cursor-pointer ${
                          statsTimeframe === tf
                            ? 'bg-white text-black shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Send report button */}
                <div className="flex flex-col items-end">
                  <button
                    onClick={handleSendEmail}
                    disabled={emailLoading}
                    className={`px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      emailLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {emailLoading ? (
                      <>
                        <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>✉️ Send to Manager</>
                    )}
                  </button>
                  {emailStatus && (
                    <span className="text-[9px] font-mono font-bold mt-1 text-zinc-500 animate-fade-in block">
                      {emailStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics cards grid */}
            {!adminStats ? (
              <div className="text-center py-20 text-zinc-400 font-mono text-xs premium-card">
                <svg className="animate-spin h-6 w-6 text-zinc-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Gathering club metrics...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
                  
                  {/* Card 1: Registered Students */}
                  <div className="bg-gradient-to-br from-indigo-50/50 via-slate-50/70 to-blue-50/30 border border-zinc-200 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/30 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold font-mono tracking-widest text-indigo-750 uppercase">Total Students</p>
                      <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                        <User className="w-5 h-5" />
                      </div>
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-indigo-950 font-mono mt-2">{adminStats.total_students}</h3>
                    <span className="text-[10px] font-mono text-indigo-600/80 block mt-3 border-t border-indigo-100/50 pt-2">All time registrations</span>
                  </div>

                  {/* Card 2: Active members */}
                  <div className="bg-gradient-to-br from-emerald-50/50 via-slate-50/70 to-teal-50/30 border border-zinc-200 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-100/30 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold font-mono tracking-widest text-emerald-750 uppercase">Active (Last Month)</p>
                      <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-emerald-950 font-mono mt-2">{adminStats.active_members_last_month}</h3>
                    <span className="text-[10px] font-mono text-emerald-600/80 block mt-3 border-t border-emerald-100/50 pt-2">Unique members submitting</span>
                  </div>

                  {/* Card 3: Uploads in timeframe */}
                  <div className="bg-gradient-to-br from-purple-50/50 via-slate-50/70 to-pink-50/30 border border-zinc-200 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-100/30 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold font-mono tracking-widest text-purple-750 uppercase">Submissions in Period</p>
                      <div className="p-2 bg-purple-100 rounded-xl text-purple-600">
                        <Image className="w-5 h-5" />
                      </div>
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-purple-950 font-mono mt-2">{adminStats.timeframe_stats.posts_count}</h3>
                    <span className="text-[10px] font-mono text-purple-600/80 block mt-3 border-t border-purple-100/50 pt-2">Total tasks/memes posted</span>
                  </div>

                  {/* Card 4: Insta Picks in timeframe */}
                  <div className="bg-gradient-to-br from-pink-50/50 via-slate-50/70 to-orange-50/30 border border-zinc-200 hover:border-pink-300 hover:shadow-lg hover:shadow-pink-100/30 rounded-2xl p-5 transition-all duration-300 transform hover:-translate-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold font-mono tracking-widest text-pink-750 uppercase">Insta Picks in Period</p>
                      <div className="p-2 bg-pink-100 rounded-xl text-pink-600">
                        <Sparkles className="w-5 h-5" />
                      </div>
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-pink-950 font-mono mt-2">{adminStats.timeframe_stats.insta_picks_count}</h3>
                    <span className="text-[10px] font-mono text-pink-600/80 block mt-3 border-t border-pink-100/50 pt-2">Showcase picks selected</span>
                  </div>

                </div>

                {/* Graph & College breakdown side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                  
                  {/* Left columns: Chart */}
                  <div className="lg:col-span-2 premium-card p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-200">
                        <div>
                          <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Participation Trend Timeline</h3>
                          <p className="text-xs text-zinc-400 font-light mt-0.5">Submissions & Instagram picks over selected timeframe.</p>
                        </div>
                        <div className="flex gap-4 text-[10px] font-mono font-bold select-none">
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500 rounded-sm inline-block"></span>Submissions</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-pink-500 rounded-sm inline-block"></span>Insta Picks</span>
                        </div>
                      </div>

                      {adminStats.chart_data && adminStats.chart_data.length > 0 ? (
                        (() => {
                          const width = 600;
                          const height = 250;
                          const padLeft = 30;
                          const padRight = 10;
                          const padTop = 15;
                          const padBottom = 35;
                          
                          const cWidth = width - padLeft - padRight;
                          const cHeight = height - padTop - padBottom;
                          
                          const chartData = adminStats.chart_data;
                          const maxVal = Math.max(
                            ...chartData.map(d => Math.max(d.posts || 0, d.insta_picks || 0)),
                            5
                          );
                          
                          const points = chartData.map((d, idx) => {
                            const x = padLeft + (chartData.length > 1 ? (idx / (chartData.length - 1)) * cWidth : cWidth / 2);
                            const yPosts = height - padBottom - ((d.posts || 0) / maxVal) * cHeight;
                            const yInsta = height - padBottom - ((d.insta_picks || 0) / maxVal) * cHeight;
                            return { x, yPosts, yInsta, label: d.label, posts: d.posts, insta: d.insta_picks };
                          });
                          
                          const postsPath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yPosts}`).join(' ');
                          const instaPath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yInsta}`).join(' ');
                          const postsAreaPath = points.length > 0 
                            ? `${postsPath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z` 
                            : '';
                            
                          const yTicks = [0, Math.round(maxVal / 2), maxVal];
                          const xTickInterval = Math.max(1, Math.floor(chartData.length / 6));
                          const xTicks = points.filter((_, idx) => idx % xTickInterval === 0);

                          return (
                            <div className="relative">
                              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                                <defs>
                                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.12" />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
                                  </linearGradient>
                                </defs>
                                
                                {/* Grid lines */}
                                {yTicks.map((tick, idx) => {
                                  const y = height - padBottom - (tick / maxVal) * cHeight;
                                  return (
                                    <g key={idx}>
                                      <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                                      <text x={padLeft - 8} y={y + 3} textAnchor="end" className="text-[9px] font-mono fill-zinc-400 font-bold">{tick}</text>
                                    </g>
                                  );
                                })}
                                
                                {/* X grid & labels */}
                                {xTicks.map((t, idx) => (
                                  <g key={idx}>
                                    <line x1={t.x} y1={padTop} x2={t.x} y2={height - padBottom} stroke="#f8fafc" strokeDasharray="3 3" />
                                    <text x={t.x} y={height - padBottom + 16} textAnchor="middle" className="text-[8px] font-mono font-bold fill-zinc-450 uppercase">{t.label}</text>
                                  </g>
                                ))}
                                
                                {/* Paths */}
                                {postsAreaPath && <path d={postsAreaPath} fill="url(#chartGrad)" />}
                                {postsPath && <path d={postsPath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                                {instaPath && <path d={instaPath} fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" />}
                                
                                {/* Interaction nodes */}
                                {points.map((p, idx) => (
                                  <g key={idx} className="group cursor-pointer">
                                    <circle cx={p.x} cy={p.yPosts} r="8" className="fill-transparent hover:fill-indigo-500/10" />
                                    <circle cx={p.x} cy={p.yPosts} r="2.5" className="fill-indigo-600 stroke-white stroke-[1.5] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <title>{`${p.label}: ${p.posts} Submissions, ${p.insta} Insta Picks`}</title>
                                  </g>
                                ))}
                              </svg>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-center py-20 text-zinc-400 font-mono text-xs bg-zinc-50 border border-zinc-150 rounded-2xl">
                          No trend points recorded for timeframe.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right column: College breakdown */}
                  <div className="premium-card p-6 flex flex-col justify-between">
                    <div>
                      <div className="mb-6 border-b border-zinc-200 pb-4">
                        <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Colleges Representation</h3>
                        <p className="text-xs text-zinc-400 font-light mt-0.5">Breakdown of student registrations by college.</p>
                      </div>

                      <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                        {adminStats.college_breakdown && adminStats.college_breakdown.length > 0 ? (
                          adminStats.college_breakdown.map((item, idx) => {
                            const percent = (item.count / Math.max(adminStats.total_students, 1)) * 100;
                            return (
                              <div key={idx} className="space-y-1 bg-zinc-50/50 p-2 border border-zinc-100 rounded-xl hover:bg-zinc-50 transition-colors">
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                  <span className="text-zinc-800 font-bold truncate pr-3">{item.college}</span>
                                  <span className="text-zinc-500 shrink-0 font-bold">{item.count} std ({percent.toFixed(0)}%)</span>
                                </div>
                                <div className="w-full bg-zinc-200/80 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-10 text-zinc-400 font-mono text-xs">
                            No college distributions found.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </>
            )}
          </div>
        )}

        {coordinatorTab === 'daily-tasks' && (
          <div className="space-y-8 animate-fade-in">
            {/* Header banner */}
            <div className="premium-card p-6">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-black">Daily Design Tasks Plan</h3>
              <p className="text-xs text-zinc-400 font-light mt-0.5">Manage daily design topics and tasks. Announced tasks are immediately highlighted for registered students.</p>
            </div>

            {/* List of days */}
            <div className="premium-card p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs select-none">
                  <thead>
                    <tr className="border-b border-zinc-150 text-zinc-400 uppercase text-[9px] tracking-wider">
                      <th className="py-2.5 px-2 text-center w-24 font-bold">Date / Day</th>
                      <th className="py-2.5 px-4 font-bold">Task Title</th>
                      <th className="py-2.5 px-4 font-bold">Task Description</th>
                      <th className="py-2.5 px-4 text-center w-28 font-bold">Status</th>
                      <th className="py-2.5 px-2 text-center w-32 font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {cycleDays.map((dayObj) => {
                      const topic = topics.find(t => t.day === dayObj.day);
                      const currentDayNum = getCurrentDayNumber(selectedCycle);
                      const isToday = dayObj.day === currentDayNum;
                      
                      return (
                        <tr key={dayObj.day} className={`hover:bg-zinc-50/50 transition-colors ${isToday ? 'bg-indigo-50/20 font-bold' : ''}`}>
                          <td className="py-3 px-2 text-center font-bold">
                            <span className="block text-black text-[11px] font-bold uppercase">{(() => {
                              if (!dayObj.date) return '';
                              const d = new Date(dayObj.date + 'T12:00:00');
                              return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                            })()}</span>
                            <span className="block text-[9px] text-zinc-400 font-normal mt-0.5">Day {dayObj.day}</span>
                            {isToday && <span className="inline-block text-[8px] bg-indigo-650 text-white rounded-md px-1.5 py-0.5 uppercase mt-1 tracking-wider">Today</span>}
                          </td>
                          <td className="py-3 px-4 font-bold">
                            {topic ? (
                              <span className="text-black">{topic.title}</span>
                            ) : (
                              <span className="text-zinc-400 font-light italic">No task announced</span>
                            )}
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate" title={topic ? topic.desc : ''}>
                            {topic ? (
                              <span className="text-zinc-550">{topic.desc}</span>
                            ) : (
                              <span className="text-zinc-350 font-light italic">Click Add Task to set challenge work</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {topic && topic.announced ? (
                              <span className="bg-green-100 border border-green-300 text-green-800 text-[9px] font-bold rounded-lg px-2.5 py-0.5 uppercase tracking-wide">
                                📢 Announced
                              </span>
                            ) : (
                              <span className="bg-zinc-100 border border-zinc-200 text-zinc-400 text-[9px] font-bold rounded-lg px-2.5 py-0.5 uppercase tracking-wide">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {topic ? (
                              <button
                                onClick={() => {
                                  setEditingTopic(dayObj);
                                  setEditedTopicTitle(topic.title);
                                  setEditedTopicDesc(topic.desc);
                                  setEditedTopicDate(topic.date || dayObj.date);
                                }}
                                className="px-3 py-1.5 bg-black hover:bg-zinc-800 text-white rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer shadow-xs"
                              >
                                Edit Task
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingTopic(dayObj);
                                  setEditedTopicTitle('');
                                  setEditedTopicDesc('');
                                  setEditedTopicDate(dayObj.date);
                                }}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer shadow-xs"
                              >
                                ➕ Add Task
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-8 text-center text-zinc-400 text-[10px] font-mono select-none uppercase tracking-widest mt-12 z-10 flex flex-col items-center justify-center gap-3">
        <img src={logoImg} alt="Codegnan Logo" className="h-8 object-contain" />
        <p>© 2026 COMMUNITY DESIGN CLUB. ALL RIGHTS RESERVED.</p>
      </footer>

      {/* ==========================================
          MODALS & OVERLAYS
          ========================================== */}
          
      {/* 1. STUDENT TASK/MEME UPLOAD MODAL */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-zinc-200 p-5 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-start border-b border-zinc-250 pb-2.5 mb-3.5">
              <div>
                <h3 className="text-sm font-bold font-mono text-black uppercase tracking-wider">Upload Design / Meme</h3>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Day {selectedDayNumber} • {cycleDays.find(d => d.day === selectedDayNumber) ? formatDateShort(cycleDays.find(d => d.day === selectedDayNumber).date) : ''}
                </p>
              </div>
              <button 
                onClick={() => { 
                  setUploadModalOpen(false); 
                  setUploadFile(null); 
                  setUploadPreview(''); 
                  setUploadMemeFile(null); 
                  setUploadMemePreview(''); 
                  setUploadTopic(''); 
                }}
                className="text-zinc-400 hover:text-black font-mono text-[10px] font-bold px-2 py-1 cursor-pointer transition-colors"
              >
                CLOSE [x]
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3.5">
              
              <div>
                <label className="block text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">What is today's topic?</label>
                <input 
                  type="text"
                  value={uploadTopic}
                  onChange={(e) => setUploadTopic(e.target.value)}
                  placeholder="e.g. Minimalist Spotify Redesign, AI Meme"
                  className="w-full premium-input py-2 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">What did you make today?</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'task', label: 'Design Task', pts: '+5 pts' },
                    { id: 'meme', label: 'Meme graphic', pts: '+3 pts' },
                    { id: 'both', label: 'Both! (Bonus)', pts: '+10 pts' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setUploadType(opt.id)}
                      className={`py-1.5 px-0.5 text-center font-mono border rounded-lg transition-all cursor-pointer ${uploadType === opt.id ? 'bg-black text-white border-black shadow-xs' : 'bg-white border-zinc-200 text-zinc-400 hover:border-black'}`}
                    >
                      <div className="text-[9px] font-bold uppercase">{opt.label}</div>
                      <div className="text-[8px] opacity-75 mt-0.5">{opt.pts}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Design tool used</label>
                  <input 
                    type="text"
                    value={uploadTool}
                    onChange={(e) => setUploadTool(e.target.value)}
                    placeholder="e.g. Figma, Photoshop"
                    className="w-full premium-input py-2 text-xs"
                    required
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {["Figma", "Canva", "Photoshop", "Illustrator"].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setUploadTool(tag)}
                        className="text-[8px] font-mono border border-zinc-200 bg-zinc-50 text-zinc-400 hover:text-black px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">Time (Minutes)</label>
                  <input 
                    type="number"
                    value={uploadTime}
                    onChange={(e) => setUploadTime(parseInt(e.target.value) || 0)}
                    min="5"
                    className="w-full premium-input font-mono py-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div className={uploadType === 'both' ? "grid grid-cols-2 gap-3.5" : "space-y-3.5"}>
                {/* Image 1 (Design Task or Meme) */}
                <div>
                  <label className="block text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">
                    {uploadType === 'both' ? "Attach Design Task Image" : (uploadType === 'meme' ? "Attach Meme Graphic" : "Attach Design Task Image")}
                  </label>
                  
                  {uploadPreview ? (
                    <div className="relative border border-zinc-200 bg-zinc-50 p-1 rounded-xl">
                      <img 
                        src={uploadPreview} 
                        alt="Preview" 
                        className="w-full h-24 object-contain"
                      />
                      <button 
                        type="button"
                        onClick={() => { setUploadFile(null); setUploadPreview(''); }}
                        className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white text-[8px] font-mono font-bold px-2 py-0.5 uppercase rounded-lg cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-300 bg-zinc-50 hover:border-black transition-colors py-3 px-4 text-center cursor-pointer relative rounded-xl">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        required
                      />
                      <div className="flex items-center justify-center gap-2">
                        <Image className="w-4 h-4 text-zinc-400" />
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase font-bold truncate">Upload Image</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Image 2 (Meme Graphic - only when Both) */}
                {uploadType === 'both' && (
                  <div>
                    <label className="block text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1.5">
                      Attach Meme Graphic
                    </label>
                    
                    {uploadMemePreview ? (
                      <div className="relative border border-zinc-200 bg-zinc-50 p-1 rounded-xl">
                        <img 
                          src={uploadMemePreview} 
                          alt="Meme Preview" 
                          className="w-full h-24 object-contain"
                        />
                        <button 
                          type="button"
                          onClick={() => { setUploadMemeFile(null); setUploadMemePreview(''); }}
                          className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white text-[8px] font-mono font-bold px-2 py-0.5 uppercase rounded-lg cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="border border-dashed border-zinc-300 bg-zinc-50 hover:border-black transition-colors py-3 px-4 text-center cursor-pointer relative rounded-xl">
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={handleMemeFileChange}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          required
                        />
                        <div className="flex items-center justify-center gap-2">
                          <Image className="w-4 h-4 text-zinc-400" />
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase font-bold truncate">Upload Meme</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full premium-btn-black py-2.5 text-xs uppercase"
              >
                {loading ? "Uploading submission..." : "Submit to Dashboard"}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* 2. SUBMISSION EVALUATOR MODAL */}
      {reviewingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl w-full max-w-xl shadow-2xl">
            <div className="flex justify-between items-start border-b border-zinc-200 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold font-mono text-black uppercase tracking-wider">Evaluate Student Submission</h3>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Student: {reviewingUpload.student_name} | Day {reviewingUpload.day_number}
                </p>
              </div>
              <button 
                onClick={() => setReviewingUpload(null)}
                className="text-zinc-400 hover:text-black font-mono text-sm px-2 cursor-pointer"
              >
                CLOSE [x]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="border border-zinc-200 bg-zinc-50 p-1.5 flex flex-col gap-3 justify-center rounded-xl">
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <span className="text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest block mb-1">
                      {reviewingUpload.image_meme_url ? "Design Task Image" : "Uploaded Image"}
                    </span>
                    <img 
                      src={api.getImageUrl(reviewingUpload.image_url)} 
                      alt="Submission Design"
                      className="w-full max-h-44 object-contain cursor-pointer border border-zinc-200 rounded"
                      onClick={() => setZoomedImage(api.getImageUrl(reviewingUpload.image_url))}
                    />
                  </div>
                  {reviewingUpload.image_meme_url && (
                    <div className="relative border-t border-zinc-200 pt-2">
                      <span className="text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest block mb-1">Meme Graphic Image</span>
                      <img 
                        src={api.getImageUrl(reviewingUpload.image_meme_url)} 
                        alt="Submission Meme"
                        className="w-full max-h-44 object-contain cursor-pointer border border-zinc-200 rounded"
                        onClick={() => setZoomedImage(api.getImageUrl(reviewingUpload.image_meme_url))}
                      />
                    </div>
                  )}
                </div>
                <button 
                  type="button" 
                  onClick={() => setZoomedImage(api.getImageUrl(reviewingUpload.image_url))}
                  className="mt-1 text-[9px] font-mono text-zinc-400 hover:text-black text-center uppercase"
                >
                  [ Click image to view high-res ]
                </button>
              </div>

              <form onSubmit={handleReviewSubmit} className="space-y-4 font-mono text-xs">
                
                <div>
                  <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Base Score Override</label>
                  <input 
                    type="number"
                    value={evalBasePoints}
                    onChange={(e) => setEvalBasePoints(parseInt(e.target.value) || 0)}
                    className="w-full premium-input text-xs"
                    required
                  />
                  <span className="text-[9px] text-zinc-400 block mt-1">
                    Auto-points allocated: {reviewingUpload.is_late ? "LATE (+2/4)" : `ON-TIME (+${reviewingUpload.type === 'both' ? 10 : (reviewingUpload.type === 'task' ? 5 : 3)})`}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Showcase Saturday Awards</label>
                  <select
                    value={evalShowcase}
                    onChange={(e) => setEvalShowcase(e.target.value)}
                    className="w-full premium-input text-xs"
                  >
                    <option value="none">No Showcase Award</option>
                    <option value="win1">{getShowcaseWinnerTitle(reviewingUpload?.day_number)} (+25 pts)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Manual Bonus Adjustment</label>
                  <input 
                    type="number"
                    value={evalExtraPoints}
                    onChange={(e) => setEvalExtraPoints(parseInt(e.target.value) || 0)}
                    className="w-full premium-input text-xs"
                    placeholder="e.g. +20 for bonus challenge"
                  />
                </div>

                <div className="bg-zinc-50 border border-zinc-200 p-2.5 text-[10px] flex justify-between rounded-xl">
                  <span className="text-zinc-500 uppercase">Computed Final Score:</span>
                  <span className="font-bold text-black text-xs">
                    +{evalBasePoints + (evalShowcase === 'win1' ? 25 : 0) + evalExtraPoints} pts
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Peer critique / feedback</label>
                  <textarea 
                    value={evalFeedback}
                    onChange={(e) => setEvalFeedback(e.target.value)}
                    rows="4"
                    className="w-full premium-input text-xs font-sans"
                    required
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    {["I like", "I wish", "What if"].map(frag => (
                      <button
                        key={frag}
                        type="button"
                        onClick={() => setEvalFeedback(prev => prev + `\n${frag}: `)}
                        className="text-[9px] font-mono border border-zinc-200 px-1.5 py-0.5 rounded-lg text-zinc-400 hover:text-black cursor-pointer"
                      >
                        +{frag}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full premium-btn-black py-2.5 text-xs uppercase"
                >
                  {loading ? "Saving changes..." : "Save Evaluation"}
                </button>

              </form>

            </div>
          </div>
        </div>
      )}

      {/* 3. STUDENT DETAIL REPORTS MODAL */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-2xl animate-fade-in">
            
            <div className="flex justify-between items-start border-b border-zinc-200 pb-3 mb-6">
              <div>
                <h3 className="text-md font-bold font-mono text-black uppercase tracking-wider">Student Profile Report</h3>
                <p className="text-[10px] text-zinc-450 font-mono mt-0.5">
                  ID: {selectedStudentDetail.student.id} | College: {selectedStudentDetail.student.college_name}
                </p>
              </div>
              <button 
                onClick={() => setSelectedStudentDetail(null)}
                className="text-zinc-400 hover:text-black font-mono text-sm px-2 cursor-pointer"
              >
                CLOSE [x]
              </button>
            </div>

            {/* Detail info cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 bg-zinc-50 border border-zinc-200 p-5 rounded-2xl shadow-sm">
              
              <div className="font-mono text-xs space-y-1.5 border-r border-zinc-200 pr-4">
                <h4 className="text-sm font-bold text-black uppercase font-sans mb-2">{selectedStudentDetail.student.name}</h4>
                <p><span className="text-zinc-500">Email:</span> {selectedStudentDetail.student.email}</p>
                <p><span className="text-zinc-500">College:</span> {selectedStudentDetail.student.college_name}</p>
                <p><span className="text-zinc-500">Passout:</span> Class of {selectedStudentDetail.student.passout_year}</p>
              </div>

              <div className="font-mono text-xs space-y-1.5 border-r border-zinc-200 px-4">
                <p><span className="text-zinc-500">Total Points:</span> <span className="text-black font-bold text-sm">{selectedStudentDetail.student.points} pts</span></p>
                <p><span className="text-zinc-500">Critique Points:</span> +{selectedStudentDetail.student.feedback_points} pts</p>
                <p><span className="text-zinc-500">Bonus Points:</span> +{selectedStudentDetail.student.manual_bonus} pts</p>
                <p><span className="text-zinc-500">Custom Title:</span> <span className="text-black uppercase font-bold">{selectedStudentDetail.student.custom_badge || 'None'}</span></p>
              </div>

              <div className="flex flex-col gap-2 justify-center">
                <button
                  onClick={(e) => handleAdjustPoints(e, 'feedback')}
                  className="w-full premium-btn-outline py-1.5 text-[10px] font-mono uppercase"
                >
                  + Add Peer critique (+2 pts)
                </button>
                <button
                  onClick={(e) => handleAdjustPoints(e, 'bonus')}
                  className="w-full premium-btn-outline py-1.5 text-[10px] font-mono uppercase"
                >
                  + Award Custom Points
                </button>
                <button
                  onClick={(e) => handleAdjustPoints(e, 'badge')}
                  className="w-full premium-btn-outline py-1.5 text-[10px] font-mono uppercase"
                >
                  🏅 Edit Custom Badge
                </button>
              </div>

            </div>

            {/* Individual logs */}
            <div>
              <h4 className="text-xs font-bold font-mono text-black uppercase tracking-wider mb-4 border-b border-zinc-200 pb-2">Student Submissions Log ({selectedStudentDetail.uploads.length})</h4>
              
              {selectedStudentDetail.uploads.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 font-mono text-xs">This student hasn't uploaded any submissions yet.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedStudentDetail.uploads.map((upload) => (
                    <div key={upload._id} className="premium-card overflow-hidden flex flex-col justify-between shadow-sm border border-zinc-200">
                      
                      <div className="relative group/img h-36 w-full bg-zinc-50 border-b border-zinc-200 overflow-hidden">
                        {upload.image_meme_url ? (
                          <div className="grid grid-cols-2 h-full w-full divide-x divide-zinc-200">
                            <div className="relative h-full w-full overflow-hidden">
                              <img 
                                src={api.getImageUrl(upload.image_url)} 
                                alt={upload.topic}
                                className="w-full h-full object-cover hover:scale-103 transition-transform duration-300 cursor-pointer"
                                onClick={() => setZoomedImage(api.getImageUrl(upload.image_url))}
                              />
                            </div>
                            <div className="relative h-full w-full overflow-hidden">
                              <img 
                                src={api.getImageUrl(upload.image_meme_url)} 
                                alt="Meme graphic"
                                className="w-full h-full object-cover hover:scale-103 transition-transform duration-300 cursor-pointer"
                                onClick={() => setZoomedImage(api.getImageUrl(upload.image_meme_url))}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <img 
                              src={api.getImageUrl(upload.image_url)} 
                              alt={upload.topic}
                              className="w-full h-full object-cover group-hover/img:scale-103 transition-transform duration-300"
                            />
                            <div 
                              onClick={() => setZoomedImage(api.getImageUrl(upload.image_url))}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                            >
                              <Eye className="w-5 h-5 text-white" />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="p-4">
                        <div className="flex justify-between items-start text-[9px] font-mono text-zinc-400 mb-1">
                          <span>Day {upload.day_number} | {upload.date}</span>
                          <span className="font-bold uppercase">{upload.type}</span>
                        </div>

                        {/* Showcase Award Badge */}
                        {(upload.showcase_award === 'win1' || upload.points_breakdown?.showcase_bonus === 25) && (
                          <div className="mb-2 bg-yellow-100 border border-yellow-350 text-yellow-800 text-[9px] font-bold font-mono px-2 py-0.5 rounded-lg flex items-center gap-1 w-max animate-pulse">
                            <span>👑 {getShowcaseWinnerTitle(upload.day_number)} 🏆</span>
                          </div>
                        )}

                        <h5 className="text-xs font-bold text-black uppercase mb-2 truncate">{upload.topic}</h5>

                        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-zinc-450 border-b border-zinc-100 pb-2 mb-3">
                          <span>Tool: <span className="text-black font-bold">{upload.tool_used}</span></span>
                          <span>Time: <span className="text-black font-bold">{upload.time_taken}m</span></span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] font-mono mb-3">
                          <span>Points awarded:</span>
                          <span className="font-bold text-black bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded">
                            +{upload.points_awarded} pts {upload.is_late && <span className="text-[8px] text-red-500 font-bold ml-1">LATE</span>}
                          </span>
                        </div>

                        {upload.status === 'reviewed' ? (
                          <div className="space-y-2.5">
                            {upload.feedback && (
                              <div className="bg-zinc-50 p-2.5 text-[10px] font-mono text-zinc-500 border-l border-zinc-300 rounded-r-lg">
                                <span className="text-[9px] text-zinc-400 block uppercase font-bold mb-0.5">Critique feedback:</span>
                                <p className="whitespace-pre-line leading-relaxed">{upload.feedback}</p>
                              </div>
                            )}
                            <button 
                              onClick={() => handleOpenReview(upload)}
                              className="w-full premium-btn-outline py-1.5 text-[10px] uppercase font-mono"
                            >
                              Re-evaluate Upload
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleOpenReview(upload)}
                            className="w-full premium-btn-black py-1.5 text-[10px] uppercase font-mono"
                          >
                            Review Submission
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 5. NEW DAILY TASK ANNOUNCEMENT POPUP */}
      {showTaskPopup && activeTodayTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 p-8 rounded-2xl w-full max-w-md shadow-2xl text-center relative overflow-hidden flex flex-col items-center">
            
            {/* Ambient background glow */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-purple-500 via-indigo-650 to-pink-500" />
            
            <div className="p-4 bg-indigo-50 text-indigo-650 rounded-full mt-2 animate-bounce">
              <Sparkles className="w-8 h-8" />
            </div>
            
            <h2 className="text-lg font-black tracking-tight text-indigo-950 uppercase mt-5 font-mono">
              {popupType === 'new' ? '📢 New Daily Task Added!' : '🔄 Daily Task Updated by Admin!'}
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono tracking-wider uppercase mt-1">
              {activeTodayTopic.date ? new Date(activeTodayTopic.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : ''} • Day {activeTodayTopic.day}
            </p>
            
            {popupType === 'new' ? (
              <div className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-5 my-6">
                <h4 className="text-xs font-bold text-black font-mono uppercase">{activeTodayTopic.title}</h4>
                <p className="text-[11px] text-zinc-550 mt-2 font-mono leading-relaxed text-left whitespace-pre-line bg-white p-3 rounded-lg border border-zinc-100 max-h-[140px] overflow-y-auto">
                  {activeTodayTopic.desc}
                </p>
              </div>
            ) : (
              <div className="w-full my-5 space-y-4">
                <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg font-mono leading-relaxed">
                  ⚠️ This is your previous task, now it has been updated by the admin:
                </p>
                
                {/* Previous Task details */}
                {previousTask && (
                  <div className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-left">
                    <span className="block text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1">Previous Task</span>
                    <h5 className="text-[10px] font-bold text-zinc-500 font-mono uppercase line-through">{previousTask.title}</h5>
                    <p className="text-[10px] text-zinc-400 mt-1 font-mono max-h-[60px] overflow-y-auto line-through leading-tight">
                      {previousTask.desc}
                    </p>
                  </div>
                )}
                
                {/* Updated Task details */}
                <div className="w-full bg-indigo-50/55 border border-indigo-150 rounded-xl p-3.5 text-left animate-pulse">
                  <span className="block text-[8px] font-bold font-mono text-indigo-500 uppercase tracking-widest mb-1">Updated Task</span>
                  <h5 className="text-[10px] font-bold text-indigo-950 font-mono uppercase">{activeTodayTopic.title}</h5>
                  <p className="text-[10px] text-zinc-700 mt-1 font-mono max-h-[85px] overflow-y-auto leading-relaxed">
                    {activeTodayTopic.desc}
                  </p>
                </div>
              </div>
            )}
            
            <button
              onClick={() => {
                const ackObj = {
                  title: activeTodayTopic.title,
                  desc: activeTodayTopic.desc,
                  announced_at: activeTodayTopic.announced_at
                };
                localStorage.setItem(`acknowledged_task_${activeTodayTopic._id}`, JSON.stringify(ackObj));
                setShowTaskPopup(false);
              }}
              className="w-full py-3 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs uppercase tracking-wider font-mono font-bold transition-all shadow-md active:scale-98 cursor-pointer"
            >
              {popupType === 'new' ? 'Start Designing Task! [x]' : 'Accept Updates & Close [x]'}
            </button>
          </div>
        </div>
      )}

      {/* 4. DAILY TOPIC EDITOR MODAL */}
      {editingTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-start border-b border-zinc-200 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold font-mono text-black uppercase tracking-wider">
                  {topics.find(t => t.day === editingTopic.day) ? "Edit Daily Task" : "Add New Task"} (Day {editingTopic.day})
                </h3>
                <p className="text-[10px] text-zinc-450 font-mono mt-0.5">Configure daily work schedule</p>
              </div>
              <button 
                onClick={() => setEditingTopic(null)}
                className="text-zinc-400 hover:text-black font-mono text-sm px-2 cursor-pointer"
              >
                CLOSE [x]
              </button>
            </div>

            <form onSubmit={handleSaveTopic} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Task Date</label>
                <input 
                  type="date" 
                  value={editedTopicDate} 
                  onChange={(e) => setEditedTopicDate(e.target.value)}
                  className="w-full premium-input font-sans font-bold text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Task Title</label>
                <input 
                  type="text" 
                  value={editedTopicTitle} 
                  onChange={(e) => setEditedTopicTitle(e.target.value)}
                  placeholder="e.g. Apple Siri Redesign Challenge"
                  className="w-full premium-input font-sans font-bold text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider mb-1.5">Task Description / Comment</label>
                <textarea 
                  value={editedTopicDesc} 
                  onChange={(e) => setEditedTopicDesc(e.target.value)}
                  placeholder="Enter details or comments about what students need to do..."
                  rows="4"
                  className="w-full premium-input font-sans text-xs"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full premium-btn-black py-2.5 text-xs uppercase"
              >
                {loading ? "Announcing Task..." : "Submit Task & Announce"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. LIGHTBOX MODAL */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          {/* Header Controls bar inside Lightbox */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-50">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const parts = zoomedImage.split('/');
                const filename = parts[parts.length - 1] || 'design-poster.jpg';
                handleDownloadImage(zoomedImage, filename);
              }}
              className="bg-white hover:bg-zinc-200 text-black text-xs font-mono font-bold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            >
              <Download className="w-4 h-4" />
              <span>Download Poster</span>
            </button>
            
            <div className="bg-zinc-900/80 border border-zinc-800 text-zinc-400 text-[10px] font-mono px-3 py-1.5 rounded-lg uppercase tracking-wider select-none">
              Click background to Close
            </div>
          </div>

          <img 
            src={zoomedImage} 
            alt="Zoomed" 
            className="max-w-full max-h-[85vh] object-contain border border-zinc-850 shadow-2xl rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 6. VIEW SUBMISSION DETAILS MODAL (STUDENT READ-ONLY VIEW) */}
      {viewingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start border-b border-zinc-200 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold font-mono text-black uppercase tracking-wider">Submission Details</h3>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Day {viewingSubmission.day_number} • {formatDateShort(viewingSubmission.date)}
                </p>
              </div>
              <button 
                onClick={() => setViewingSubmission(null)}
                className="text-zinc-400 hover:text-black font-mono text-xs px-2 cursor-pointer"
              >
                CLOSE [x]
              </button>
            </div>

            {/* Showcase Congratulations Banner if any */}
            {(viewingSubmission.showcase_award === 'win1' || viewingSubmission.points_breakdown?.showcase_bonus === 25) && (
              <div className="mb-4 bg-yellow-100 border border-yellow-350 text-yellow-800 text-xs font-bold font-mono p-4 rounded-xl flex flex-col gap-1 items-center text-center shadow-xs animate-pulse">
                <span className="text-lg font-bold">👑 Congratulations! 🏆</span>
                <span>Your Day {viewingSubmission.day_number} design was selected as the {getShowcaseWinnerTitle(viewingSubmission.day_number)}!</span>
              </div>
            )}

            <div className="space-y-4 font-mono text-xs">
              
              {/* Image previews side-by-side or single */}
              <div className="border border-zinc-200 bg-zinc-50 p-2 rounded-xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 justify-center">
                  <div>
                    <span className="text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest block mb-1 text-center">
                      {viewingSubmission.image_meme_url ? "Design Task" : "Uploaded Image"}
                    </span>
                    <img 
                      src={api.getImageUrl(viewingSubmission.image_url)} 
                      alt="Design"
                      className="w-full max-h-48 object-contain cursor-zoom-in border border-zinc-200 rounded"
                      onClick={() => setZoomedImage(api.getImageUrl(viewingSubmission.image_url))}
                    />
                  </div>
                  {viewingSubmission.image_meme_url && (
                    <div>
                      <span className="text-[8px] font-bold font-mono text-zinc-400 uppercase tracking-widest block mb-1 text-center">Meme Graphic</span>
                      <img 
                        src={api.getImageUrl(viewingSubmission.image_meme_url)} 
                        alt="Meme"
                        className="w-full max-h-48 object-contain cursor-zoom-in border border-zinc-200 rounded"
                        onClick={() => setZoomedImage(api.getImageUrl(viewingSubmission.image_meme_url))}
                      />
                    </div>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <button
                    onClick={() => {
                      const filename = `day_${viewingSubmission.day_number}_design.jpg`;
                      handleDownloadImage(api.getImageUrl(viewingSubmission.image_url), filename);
                    }}
                    className="text-[9px] font-mono text-zinc-500 hover:text-black bg-zinc-200/60 hover:bg-zinc-200 px-3 py-1 rounded flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    <Download className="w-3 h-3" /> Download Poster
                  </button>
                </div>
              </div>

              {/* Submission details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 border border-zinc-200 p-4 rounded-xl">
                <div>
                  <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase block mb-0.5">Topic:</span>
                  <span className="text-black font-bold uppercase text-xs block truncate">{viewingSubmission.topic}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase block mb-0.5">Submission Type:</span>
                  <span className="text-black font-bold uppercase text-xs block">{viewingSubmission.type}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase block mb-0.5">Tool Used:</span>
                  <span className="text-black font-bold uppercase text-xs block">{viewingSubmission.tool_used}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase block mb-0.5">Time Taken:</span>
                  <span className="text-black font-bold uppercase text-xs block">{viewingSubmission.time_taken} mins</span>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="border border-zinc-200 p-4 rounded-xl space-y-2.5">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-zinc-400 border-b border-zinc-150 pb-1.5 mb-1">
                  <span>Score Breakdown</span>
                  <span className="text-black">+{viewingSubmission.points_awarded} pts</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Base Points:</span>
                  <span className="text-black font-bold font-mono">+{viewingSubmission.points_breakdown?.base_points || viewingSubmission.points_awarded} pts</span>
                </div>
                {viewingSubmission.points_breakdown?.showcase_bonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Saturday Showcase Award:</span>
                    <span className="text-black font-bold font-mono">+{viewingSubmission.points_breakdown.showcase_bonus} pts</span>
                  </div>
                )}
                {viewingSubmission.points_breakdown?.manual_bonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Manual Bonus Adjustment:</span>
                    <span className="text-black font-bold font-mono">+{viewingSubmission.points_breakdown.manual_bonus} pts</span>
                  </div>
                )}
                {viewingSubmission.is_late && (
                  <div className="text-[9px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-1 bg-red-50/50 p-1.5 rounded-lg border border-red-100 w-max">
                    <Clock className="w-3 h-3" /> Late submission points applied
                  </div>
                )}
              </div>

              {/* Critique Feedback */}
              {viewingSubmission.status === 'reviewed' && viewingSubmission.feedback && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] text-zinc-450 font-bold uppercase tracking-wider">Critique / Feedback</label>
                  <div className="bg-zinc-50 border-l border-black p-3.5 text-[10px] text-zinc-650 font-mono rounded-r-lg whitespace-pre-line leading-relaxed">
                    {viewingSubmission.feedback}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 7. CONGRATULATIONS CELEBRATION MODAL */}
      {celebAwardUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-zinc-200 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
            
            {/* Confetti celebration bg design elements */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-300 via-amber-500 to-yellow-300 animate-pulse"></div>
            
            {/* Close button */}
            <button 
              onClick={handleCloseCelebModal}
              className="absolute top-4 right-4 text-zinc-400 hover:text-black font-mono text-sm px-2 cursor-pointer transition-colors"
            >
              CLOSE [x]
            </button>

            {/* Celebration Icons & Headers */}
            <div className="my-6 select-none relative animate-bounce">
              <div className="text-6xl filter drop-shadow">👑</div>
              <div className="absolute -top-1 -right-2 text-2xl animate-ping opacity-60">✨</div>
              <div className="absolute -bottom-1 -left-2 text-2xl animate-ping opacity-60">🎉</div>
            </div>

            <h2 className="text-xl font-bold uppercase tracking-wider font-mono text-black">Congratulations!</h2>
            
            <p className="text-sm text-zinc-655 font-bold font-mono mt-3 mb-6 bg-yellow-50 border border-yellow-250 text-yellow-800 px-4 py-3 rounded-2xl">
              👑 Day {celebAwardUpload.day_number} design selected as the {getShowcaseWinnerTitle(celebAwardUpload.day_number)}! 👑
            </p>

            {/* Poster Preview */}
            <div className="border border-zinc-200 bg-zinc-50 p-2 rounded-2xl w-full max-w-[280px] shadow-sm mb-6">
              <img 
                src={api.getImageUrl(celebAwardUpload.image_url)} 
                alt="Award Design" 
                className="w-full h-36 object-contain rounded border border-zinc-200 bg-white animate-fade-in"
              />
              <span className="block text-[10px] font-mono text-zinc-400 mt-2 uppercase truncate">{celebAwardUpload.topic}</span>
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-3">
              <button
                onClick={() => {
                  const filename = `day_${celebAwardUpload.day_number}_showcase_winner.jpg`;
                  handleDownloadImage(api.getImageUrl(celebAwardUpload.image_url), filename);
                }}
                className="w-full bg-black hover:bg-zinc-800 text-white text-xs font-mono font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg transition-all"
              >
                <Download className="w-4 h-4" /> Download Poster
              </button>
              
              <button
                onClick={handleCloseCelebModal}
                className="w-full premium-btn-outline py-2.5 text-xs font-mono uppercase text-zinc-550 hover:text-black cursor-pointer"
              >
                Acknowledge & Close
              </button>
            </div>

          </div>
        </div>
      )}
      {/* 7.5. INSTAGRAM PICK CELEBRATION MODAL */}
      {celebInstaUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-zinc-200 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
            
            {/* Instagram classic warm gradient bar */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-500 via-red-500 to-purple-600"></div>
            
            {/* Close button */}
            <button 
              onClick={handleCloseInstaModal}
              className="absolute top-4 right-4 text-zinc-400 hover:text-black font-mono text-sm px-2 cursor-pointer transition-colors"
            >
              CLOSE [x]
            </button>

            {/* Celebration Instagram Icons & Headers */}
            <div className="my-6 select-none relative animate-pulse">
              <div className="text-6xl filter drop-shadow">📸</div>
              <div className="absolute -top-1 -right-2 text-2xl animate-ping opacity-60">✨</div>
              <div className="absolute -bottom-1 -left-2 text-2xl animate-ping opacity-60">🎉</div>
            </div>

            <h2 className="text-xl font-bold uppercase tracking-wider font-mono text-black">Instagram Pick!</h2>
            
            <p className="text-xs text-zinc-650 font-bold font-mono mt-3 mb-6 bg-gradient-to-r from-purple-50/50 to-pink-50/30 border border-pink-250 text-pink-900 px-4 py-3 rounded-2xl">
              📸 Your Day {celebInstaUpload.day_number} {celebInstaUpload.insta_pick_type === 'meme' ? 'Meme graphic' : 'Design task'} has been picked for Instagram! 📸
            </p>

            {/* Poster Preview */}
            <div className="border border-zinc-200 bg-zinc-50 p-2 rounded-2xl w-full max-w-[280px] shadow-sm mb-6">
              <img 
                src={api.getImageUrl(celebInstaUpload.image_url)} 
                alt="Picked Design" 
                className="w-full h-36 object-contain rounded border border-zinc-200 bg-white animate-fade-in"
              />
              <span className="block text-[10px] font-mono text-zinc-400 mt-2 uppercase truncate">{celebInstaUpload.topic}</span>
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-3">
              <button
                onClick={() => {
                  const filename = `day_${celebInstaUpload.day_number}_insta_pick.jpg`;
                  handleDownloadImage(api.getImageUrl(celebInstaUpload.image_url), filename);
                }}
                className="w-full bg-black hover:bg-zinc-800 text-white text-xs font-mono font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg transition-all"
              >
                <Download className="w-4 h-4" /> Download My Image
              </button>
              
              <button
                onClick={handleCloseInstaModal}
                className="w-full premium-btn-outline py-2.5 text-xs font-mono uppercase text-zinc-550 hover:text-black cursor-pointer font-bold"
              >
                Awesome! Let's Go 📸
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 8. STUDENT POLL VOTING MODAL */}
      {user && user.role === 'student' && activePoll && activePoll.status === 'active' && !activePoll.voted_students?.some(vid => String(vid) === String(user.id)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 p-6 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-zinc-200 pb-3.5 mb-5">
              <div>
                <span className="text-[9px] font-bold font-mono tracking-widest bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded uppercase">
                  Weekly Poll Active 🗳️
                </span>
                <h3 className="text-base font-bold font-mono text-black uppercase tracking-wider mt-2">Attend the Weekly Saturday Showcase Poll</h3>
                <p className="text-[11px] text-zinc-450 font-mono mt-0.5">
                  Select your favorite design of the week. You can only vote once, and your participation helps pick the winners!
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-xl mb-4">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              {activePoll.options?.map((option) => {
                const isSelected = selectedPollOption === option.upload_id;
                return (
                  <div 
                    key={option.upload_id}
                    onClick={() => setSelectedPollOption(option.upload_id)}
                    className={`premium-card overflow-hidden flex flex-col justify-between cursor-pointer border transition-all duration-300 ${
                      isSelected 
                        ? 'border-black ring-2 ring-black bg-zinc-50/50 scale-102 shadow-md' 
                        : 'border-zinc-200 hover:border-zinc-400 hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Option Image Container */}
                      <div className="relative group/opt h-40 w-full bg-zinc-50 border-b border-zinc-200 overflow-hidden">
                        {option.image_meme_url ? (
                          <div className="grid grid-cols-2 h-full w-full divide-x divide-zinc-200">
                            <div className="relative h-full w-full overflow-hidden">
                              <img 
                                src={api.getImageUrl(option.image_url)} 
                                alt={option.topic}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="relative h-full w-full overflow-hidden">
                              <img 
                                src={api.getImageUrl(option.image_meme_url)} 
                                alt="Meme graphic"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        ) : (
                          <img 
                            src={api.getImageUrl(option.image_url)} 
                            alt={option.topic}
                            className="w-full h-full object-cover"
                          />
                        )}
                        
                        {/* Zoom overlay */}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomedImage(api.getImageUrl(option.image_url));
                          }}
                          className="absolute bottom-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-lg opacity-0 group-hover/opt:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
                          title="View High-Res"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <h4 className="text-xs font-bold text-black uppercase mb-1 truncate">{option.topic}</h4>
                        <p className="text-[10px] font-mono text-zinc-550 uppercase">Designer: <span className="text-black font-bold">{option.student_name}</span></p>
                      </div>
                    </div>

                    {/* Selection Indicator Footer */}
                    <div className={`p-3 text-center border-t text-[10px] font-mono font-bold uppercase transition-all duration-300 ${
                      isSelected 
                        ? 'bg-black text-white border-black' 
                        : 'bg-zinc-50 text-zinc-400 border-zinc-200 hover:text-black'
                    }`}>
                      {isSelected ? '✓ Selected Choice' : 'Click to Select'}
                    </div>

                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-150 pt-4">
              <button 
                type="button"
                disabled={loading || !selectedPollOption}
                onClick={async () => {
                  if (!selectedPollOption) return;
                  setLoading(true);
                  setErrorMsg('');
                  try {
                    const res = await api.submitVote(activePoll._id, selectedPollOption);
                    if (res && res.error) {
                      setErrorMsg(res.error);
                    } else {
                      setSelectedPollOption('');
                      await loadDashboardData(selectedCycle);
                    }
                  } catch (err) {
                    setErrorMsg("Failed to submit vote. Please try again.");
                  } finally {
                    setLoading(false);
                  }
                }}
                className={`px-6 py-2.5 text-xs font-mono font-bold uppercase rounded-xl transition-all ${
                  selectedPollOption 
                    ? 'bg-black text-white hover:bg-zinc-800 cursor-pointer shadow-md' 
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
                }`}
              >
                {loading ? 'Submitting vote...' : 'Submit Vote 🗳️'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
