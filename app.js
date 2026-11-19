/**
 * MISSION 2026-2027 — STUDY TRACKER & ADMIN COMMAND CENTER
 * Fully functional app.js with Authentication, Pure Lecture Tasks, and Admin Portal
 *
 * Credentials:
 *   Admin:   username "admin"   / password "arav"
 *   Student: username "student" / password "arav"
 */
(function () {
  'use strict';

  /* ============================================================
     CONSTANTS
  ============================================================ */
  const STORAGE_KEY = 'mission2027_tracker_v1';
  const AUTH_STORAGE_KEY = 'mission2027_auth_user';
  const TIMELINE_START = '2026-11-20';
  const TIMELINE_END   = '2027-11-02';

  /* ============================================================
     GENERATE LECTURES (from data.js)
  ============================================================ */
  const masterLectures = generateLectureRows(); // from data.js
  const subjectMap = {};
  STUDY_DATA.subjects.forEach(sub => { subjectMap[sub.id] = sub; });

  /* ============================================================
     DATE HELPERS
  ============================================================ */
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function offsetDate(dateStr, offset) {
    const [y,m,d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    dt.setDate(dt.getDate() + offset);
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  }
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y,m,d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  }
  function uid() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  /* ============================================================
     APPLICATION STATE
  ============================================================ */
  const state = {
    theme: 'dark',
    activeTab: 'tab-progress',
    currentUser: null, // { username: 'admin'|'student', role: 'admin'|'student', name: string }
    userRole: 'student', // 'student' | 'admin'
    activeStudentId: null,
    // Lecture progress: { [sNo]: { watched, notes, revision, question } }
    lectures: {},
    // Mock scores: { [paperKey]: { a1_mark, a1_date, a2_mark, a2_date, a3_mark, a3_date } }
    mocks: {},
    // Daily targets (Lecture tasks): { [dateStr]: [ ...targetObjects ] }
    dailyTargets: {},
    selectedTargetDate: todayStr(),
    dailyFilter: 'ALL',
    // Timetable: { [dateStr]: [ ...slotObjects ] }
    dailyTimetables: {},
    selectedTimetableDate: todayStr(),
    // Syllabus filters
    todoFilter: 'ALL',
    todoSearch: '',
    todoSubject: 'ALL',
    currentPage: 1,
    pageSize: 50,
    // Mock filter
    selectedMockSeries: STUDY_DATA.mockSeries[0]?.id || 'ssc_cgl_t1',
    // Streaks
    streak: 1,
    lastActiveDate: todayStr(),
    // Admin & Mentor specific state
    adminTaskAssignMode: 'lecture', // 'lecture' | 'custom'
    mentorFeedback: 'Welcome to Mission 2026-2027! Finish your assigned daily lectures and keep revising your weak areas.',
    mentorNoticeDismissed: false,
    selectedAdminRoutineDate: todayStr()
  };

  /* ============================================================
     PERSISTENT STUDENT REGISTRY
     - Users enter their own name and password (no random generator)
     - Empty by default (no pre-seeded dummy students)
     - Real-time overall performance tracking for Admin as students join
  ============================================================ */
  const STUDENTS_STORAGE_KEY = 'mission2027_students_registry_v3';

  function getRegisteredStudents() {
    try {
      const raw = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load registered students:', e);
    }
    return {};
  }

  function saveRegisteredStudents(studentsMap) {
    try {
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(studentsMap));
    } catch (e) {
      console.warn('Failed to save registered students:', e);
    }
  }

  function registerOrLoginStudent(name, password) {
    const cleanName = (name || '').trim();
    const cleanPass = (password || '').trim();
    if (!cleanName) return { success: false, message: 'Please enter your student name.' };
    if (!cleanPass) return { success: false, message: 'Please enter your password.' };

    const students = getRegisteredStudents();
    const existingKey = Object.keys(students).find(k =>
      students[k].name.toLowerCase() === cleanName.toLowerCase() ||
      (students[k].username && students[k].username.toLowerCase() === cleanName.toLowerCase()) ||
      students[k].id.toLowerCase() === ('student_' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_'))
    );

    let studentObj;
    if (existingKey) {
      studentObj = students[existingKey];
      if (studentObj.password && studentObj.password !== cleanPass) {
        return { success: false, message: `Incorrect password for ${studentObj.name}.` };
      }
      studentObj.lastActiveDate = todayStr();
      students[existingKey] = studentObj;
    } else {
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const newId = 'student_' + slug + '_' + Math.floor(Math.random() * 900 + 100);
      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🚀', '⭐', '🎯'];
      const chosenAvatar = avatars[Math.floor(Math.random() * avatars.length)];

      const tStr = todayStr();
      studentObj = {
        id: newId,
        username: cleanName.toLowerCase().replace(/\s+/g, '_'),
        name: cleanName,
        password: cleanPass,
        avatar: chosenAvatar,
        batch: 'Mission 2026-2027 Master Batch • Target: SSC CGL / CHSL / RRB',
        status: '🟢 Active Aspirant',
        registeredAt: tStr,
        lastActiveDate: tStr,
        streak: 1,
        mentorFeedback: 'Welcome to Mission 2026-2027! Finish your daily targets and keep revising your weak areas.',
        mentorNoticeDismissed: false,
        lectures: {},
        dailyTargets: {},
        dailyTimetables: {},
        mocks: {}
      };

      students[newId] = studentObj;
    }

    saveRegisteredStudents(students);
    return { success: true, student: studentObj };
  }

  function calculateStudentMetrics(student) {
    if (!student) return null;
    const lecs = student.lectures || {};
    let totalW = 0, totalN = 0, totalR = 0, totalQ = 0;

    masterLectures.forEach(l => {
      const st = lecs[l.sNo];
      if (st) {
        if (st.watched) totalW++;
        if (st.notes) totalN++;
        if (st.revision) totalR++;
        if (st.question) totalQ++;
      }
    });

    const totalStages = masterLectures.length * 4; // 5380
    const done = totalW + totalN + totalR + totalQ;
    const pct = totalStages > 0 ? (done / totalStages) * 100 : 0;

    // Mocks
    const mocks = student.mocks || {};
    let mocksCount = 0;
    let totalScore = 0;
    Object.values(mocks).forEach(m => {
      if (m && m.attempted) {
        mocksCount++;
        if (m.score !== undefined && !isNaN(m.score)) {
          totalScore += Number(m.score);
        }
      }
    });
    const avgScore = mocksCount > 0 ? (totalScore / mocksCount).toFixed(1) : '--';

    // Task Adherence
    const targets = student.dailyTargets || {};
    let taskTotal = 0, taskDone = 0;
    Object.values(targets).forEach(list => {
      if (Array.isArray(list)) {
        list.forEach(t => {
          taskTotal++;
          if (t.completed) taskDone++;
        });
      }
    });
    const taskRate = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

    // Streak
    const streak = student.streak || 1;

    // Scheduled study hours today
    const tStr = todayStr();
    const todaySlots = (student.dailyTimetables && student.dailyTimetables[tStr]) || [];
    let studyHrs = 0;
    todaySlots.forEach(s => {
      if (s.category === 'study') studyHrs += parseSlotDur(s.time);
    });

    return {
      pct,
      done,
      totalStages,
      totalW,
      totalN,
      totalR,
      totalQ,
      mocksCount,
      avgScore,
      taskTotal,
      taskDone,
      taskRate,
      streak,
      studyHrs
    };
  }

  /* ============================================================
     DOM CACHE
  ============================================================ */
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  const DOM = {
    // Auth elements
    authScreen: $('authScreen'),
    authError: $('authError'),
    tabAuthStudent: $('tabAuthStudent'),
    tabAuthAdmin: $('tabAuthAdmin'),
    authStudentForm: $('authStudentForm'),
    authStudentName: $('authStudentName'),
    authStudentPassword: $('authStudentPassword'),
    btnSubmitStudentAuth: $('btnSubmitStudentAuth'),
    authAdminForm: $('authAdminForm'),
    authAdminUsername: $('authAdminUsername'),
    authAdminPassword: $('authAdminPassword'),
    btnSubmitAdminAuth: $('btnSubmitAdminAuth'),
    adminTotalStudentsBadge: $('adminTotalStudentsBadge'),
    adminStudentsRosterBody: $('adminStudentsRosterBody'),
    userProfileBadge: $('userProfileBadge'),
    userProfileIcon: $('userProfileIcon'),
    userProfileName: $('userProfileName'),
    logoutBtn: $('logoutBtn'),
    // Header & Theme
    themeToggleBtn: $('themeToggleBtn'),
    themeIcon: $('themeIcon'),
    exportBtn: $('exportBtn'),
    importBtn: $('importBtn'),
    importFileInput: $('importFileInput'),
    resetBtn: $('resetBtn'),
    // Role switcher & Admin banner
    roleStudentBtn: $('roleStudentBtn'),
    roleAdminBtn: $('roleAdminBtn'),
    adminModeBanner: $('adminModeBanner'),
    adminStudentSelect: $('adminStudentSelect'),
    quickAssignTaskBtn: $('quickAssignTaskBtn'),
    quickRoutineBtn: $('quickRoutineBtn'),
    exitAdminModeBtn: $('exitAdminModeBtn'),
    mentorNoticeBanner: $('mentorNoticeBanner'),
    mentorNoticeText: $('mentorNoticeText'),
    dismissMentorNoticeBtn: $('dismissMentorNoticeBtn'),
    // Nav
    navTabs: $$('.nav-tab'),
    tabPanes: $$('.tab-pane'),
    badgeOverallPct: $('badgeOverallPct'),
    badgeDailyTasksCount: $('badgeDailyTasksCount'),
    badgeTimetableStudyHrs: $('badgeTimetableStudyHrs'),
    badgeLectureCount: $('badgeLectureCount'),
    badgeMockCount: $('badgeMockCount'),
    navTabAdmin: $('navTabAdmin'),
    badgeAdminAlerts: $('badgeAdminAlerts'),
    // Hero
    statOverallPct: $('statOverallPct'),
    statStagesDone: $('statStagesDone'),
    statLecturesDone: $('statLecturesDone'),
    statNotesDone: $('statNotesDone'),
    statRevisionDone: $('statRevisionDone'),
    statQuestionsDone: $('statQuestionsDone'),
    statMocksAttempted: $('statMocksAttempted'),
    statTotalLecturesSub: $('statTotalLecturesSub'),
    statTotalNotesSub: $('statTotalNotesSub'),
    radialProgressCircle: $('radialProgressCircle'),
    radialProgressText: $('radialProgressText'),
    aspirantRankBadge: $('aspirantRankBadge'),
    targetCountdown: $('targetCountdown'),
    targetStartDate: $('targetStartDate'),
    targetEndDate: $('targetEndDate'),
    // Subject progress
    subjectCategoryFilter: $('subjectCategoryFilter'),
    subjectCardsGrid: $('subjectCardsGrid'),
    // Daily targets (Date + Lecture tasks only)
    dailyTaskDatePicker: $('dailyTaskDatePicker'),
    dtPrevDayBtn: $('dtPrevDayBtn'),
    dtNextDayBtn: $('dtNextDayBtn'),
    todayDateBtn: $('todayDateBtn'),
    targetDayName: $('targetDayName'),
    selectedDateLabel: $('selectedDateLabel'),
    dailyTasksSummaryText: $('dailyTasksSummaryText'),
    goToSyllabusBtn: $('goToSyllabusBtn'),
    dailyTasksList: $('dailyTasksList'),
    clearCompletedDailyTasksBtn: $('clearCompletedDailyTasksBtn'),
    dailyProgressRingCircle: $('dailyProgressRingCircle'),
    dailyProgressRingText: $('dailyProgressRingText'),
    dailyCompletionStatusMsg: $('dailyCompletionStatusMsg'),
    dailyStreakCount: $('dailyStreakCount'),
    todaySubjectGainsList: $('todaySubjectGainsList'),
    // Timetable
    ttDatePicker: $('ttDatePicker'),
    ttPrevDayBtn: $('ttPrevDayBtn'),
    ttNextDayBtn: $('ttNextDayBtn'),
    ttTodayBtn: $('ttTodayBtn'),
    ttDayTitle: $('ttDayTitle'),
    openAddSlotModalBtn: $('openAddSlotModalBtn'),
    clearDateTimetableBtn: $('clearDateTimetableBtn'),
    timetableSlotCount: $('timetableSlotCount'),
    timelineList: $('timelineList'),
    liveTimeClock: $('liveTimeClock'),
    statTimetableStudyHrs: $('statTimetableStudyHrs'),
    statTimetableWorkHrs: $('statTimetableWorkHrs'),
    statTimetableCoachingHrs: $('statTimetableCoachingHrs'),
    statTimetableRestHrs: $('statTimetableRestHrs'),
    fillTimetableStudy: $('fillTimetableStudy'),
    fillTimetableWork: $('fillTimetableWork'),
    fillTimetableCoaching: $('fillTimetableCoaching'),
    fillTimetableRest: $('fillTimetableRest'),
    // Slot modal
    slotEditorModal: $('slotEditorModal'),
    slotModalTitle: $('slotModalTitle'),
    slotEditorForm: $('slotEditorForm'),
    editSlotId: $('editSlotId'),
    slotStartTime: $('slotStartTime'),
    slotEndTime: $('slotEndTime'),
    slotLabel: $('slotLabel'),
    slotCategory: $('slotCategory'),
    slotIcon: $('slotIcon'),
    slotAssignedSubject: $('slotAssignedSubject'),
    slotDesc: $('slotDesc'),
    closeSlotModalBtn: $('closeSlotModalBtn'),
    cancelSlotModalBtn: $('cancelSlotModalBtn'),
    // Syllabus
    todoSearchInput: $('todoSearchInput'),
    todoSubjectFilter: $('todoSubjectFilter'),
    todoTableBody: $('todoTableBody'),
    visibleRowCount: $('visibleRowCount'),
    totalMasterLecturesCount: $('totalMasterLecturesCount'),
    visiblePct: $('visiblePct'),
    markAllVisibleDoneBtn: $('markAllVisibleDoneBtn'),
    resetAllVisibleBtn: $('resetAllVisibleBtn'),
    currentPageNum: $('currentPageNum'),
    totalPagesNum: $('totalPagesNum'),
    prevPageBtn: $('prevPageBtn'),
    nextPageBtn: $('nextPageBtn'),
    // Mock tests
    mockSeriesTabs: $('mockSeriesTabs'),
    mockSearchInput: $('mockSearchInput'),
    mockSeriesInfo: $('mockSeriesInfo'),
    mockPapersGrid: $('mockPapersGrid'),
    // Trophies
    trophiesGrid: $('trophiesGrid'),
    // Admin Component elements
    adminStudentAvatar: $('adminStudentAvatar'),
    adminStudentDispName: $('adminStudentDispName'),
    adminStudentDispBatch: $('adminStudentDispBatch'),
    adminStudentStatusPill: $('adminStudentStatusPill'),
    adminRefreshBtn: $('adminRefreshBtn'),
    adminStatOverallPct: $('adminStatOverallPct'),
    adminStatMilestones: $('adminStatMilestones'),
    adminStatLectures: $('adminStatLectures'),
    adminStatLecturesSub: $('adminStatLecturesSub'),
    adminStatNotesRev: $('adminStatNotesRev'),
    adminStatTaskRate: $('adminStatTaskRate'),
    adminStatTaskDone: $('adminStatTaskDone'),
    adminStatMocksAttempted: $('adminStatMocksAttempted'),
    adminStatMocksAvg: $('adminStatMocksAvg'),
    adminStatStreak: $('adminStatStreak'),
    adminStatScheduleHrs: $('adminStatScheduleHrs'),
    adminMentorFeedbackInput: $('adminMentorFeedbackInput'),
    adminSaveFeedbackBtn: $('adminSaveFeedbackBtn'),
    adminSubjectsMatrix: $('adminSubjectsMatrix'),
    // Admin task assign forms (Direct lecture or Optional custom task)
    btnAdminModeLecture: $('btnAdminModeLecture'),
    btnAdminModeCustom: $('btnAdminModeCustom'),
    adminLectureAssignForm: $('adminLectureAssignForm'),
    adminTaskDate: $('adminTaskDate'),
    adminTaskTodayBtn: $('adminTaskTodayBtn'),
    adminLecturePriority: $('adminLecturePriority'),
    adminLectureSubjectSelect: $('adminLectureSubjectSelect'),
    adminLectureSearchInput: $('adminLectureSearchInput'),
    adminLectureSelect: $('adminLectureSelect'),
    adminLectureNote: $('adminLectureNote'),
    // Custom task form
    adminCustomAssignForm: $('adminCustomAssignForm'),
    adminCustomTaskDate: $('adminCustomTaskDate'),
    adminCustomTaskTodayBtn: $('adminCustomTaskTodayBtn'),
    adminCustomTaskPriority: $('adminCustomTaskPriority'),
    adminCustomTaskTitle: $('adminCustomTaskTitle'),
    adminCustomTaskSubject: $('adminCustomTaskSubject'),
    adminCustomTaskHours: $('adminCustomTaskHours'),
    adminCustomTaskNote: $('adminCustomTaskNote'),
    adminAssignedTasksList: $('adminAssignedTasksList'),
    adminAssignedTasksCount: $('adminAssignedTasksCount'),
    // Admin routine manager
    adminRoutineDate: $('adminRoutineDate'),
    adminRoutineTodayBtn: $('adminRoutineTodayBtn'),
    adminRoutineDateLabel: $('adminRoutineDateLabel'),
    adminRoutineSlotCount: $('adminRoutineSlotCount'),
    adminSlotForm: $('adminSlotForm'),
    adminSlotStart: $('adminSlotStart'),
    adminSlotEnd: $('adminSlotEnd'),
    adminSlotLabel: $('adminSlotLabel'),
    adminSlotCategory: $('adminSlotCategory'),
    adminSlotIcon: $('adminSlotIcon'),
    adminSlotSubject: $('adminSlotSubject'),
    adminSlotDesc: $('adminSlotDesc'),
    adminRoutineList: $('adminRoutineList'),
    // Modals/toast
    celebrationModal: $('celebrationModal'),
    celebrationTitle: $('celebrationTitle'),
    celebrationMsg: $('celebrationMsg'),
    closeCelebrationBtn: $('closeCelebrationBtn'),
    resetConfirmModal: $('resetConfirmModal'),
    cancelResetBtn: $('cancelResetBtn'),
    confirmResetBtn: $('confirmResetBtn'),
    toastNotification: $('toastNotification')
  };

  /* ============================================================
     AUTHENTICATION SYSTEM
     - Admin: username "admin" / password "arav"
     - Student: user-provided name & password by themselves
     - Live multi-student synchronization
  ============================================================ */
  function initAuth() {
    getRegisteredStudents();

    try {
      const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (savedAuth) {
        state.currentUser = JSON.parse(savedAuth);
      }
    } catch (e) {
      console.warn('Auth load error:', e);
    }

    if (state.currentUser) {
      if (state.currentUser.role === 'student') {
        const students = getRegisteredStudents();
        const s = students[state.currentUser.id] || Object.values(students).find(x => x.name.toLowerCase() === (state.currentUser.name || '').toLowerCase());
        if (s) {
          loadStudentDataIntoState(s);
          applyAuthenticatedUser(state.currentUser);
        } else {
          // Student was from previous session or not in registry; prompt login
          logout();
          return;
        }
      } else {
        applyAuthenticatedUser(state.currentUser);
      }
    } else {
      showAuthScreen();
    }
  }

  function showAuthScreen() {
    if (DOM.authScreen) DOM.authScreen.style.display = 'flex';
    if (DOM.authError) DOM.authError.style.display = 'none';

    if (DOM.authStudentName) DOM.authStudentName.value = '';
    if (DOM.authStudentPassword) DOM.authStudentPassword.value = '';

    // Default to student auth tab
    if (DOM.tabAuthStudent) DOM.tabAuthStudent.classList.add('active');
    if (DOM.tabAuthAdmin) DOM.tabAuthAdmin.classList.remove('active');
    if (DOM.authStudentForm) DOM.authStudentForm.style.display = 'block';
    if (DOM.authAdminForm) DOM.authAdminForm.style.display = 'none';
  }

  function hideAuthScreen() {
    if (DOM.authScreen) DOM.authScreen.style.display = 'none';
  }

  function loadStudentDataIntoState(student) {
    if (!student) return;
    state.lectures = student.lectures || {};
    state.mocks = student.mocks || {};
    state.dailyTargets = student.dailyTargets || {};
    state.dailyTimetables = student.dailyTimetables || {};
    state.streak = student.streak || 1;
    state.lastActiveDate = student.lastActiveDate || todayStr();
    state.mentorFeedback = student.mentorFeedback || '';
    state.mentorNoticeDismissed = !!student.mentorNoticeDismissed;
  }

  function applyAuthenticatedUser(user) {
    state.currentUser = user;
    state.userRole = user.role;
    hideAuthScreen();

    // Update Header Badge
    if (DOM.userProfileBadge) {
      DOM.userProfileBadge.className = `user-profile-badge ${user.role === 'admin' ? 'badge-admin' : 'badge-student'}`;
    }
    if (DOM.userProfileIcon) DOM.userProfileIcon.textContent = user.avatar || (user.role === 'admin' ? '👑' : '🎓');
    if (DOM.userProfileName) DOM.userProfileName.textContent = user.role === 'admin' ? 'Admin (admin)' : `${user.name}`;

    // Update Role Switcher
    if (DOM.roleStudentBtn) DOM.roleStudentBtn.classList.toggle('active', user.role === 'student');
    if (DOM.roleAdminBtn) {
      DOM.roleAdminBtn.classList.toggle('active', user.role === 'admin');
      DOM.roleAdminBtn.classList.toggle('role-admin-active', user.role === 'admin');
    }

    // Role-based visibility
    if (DOM.adminModeBanner) {
      DOM.adminModeBanner.style.display = user.role === 'admin' ? 'flex' : 'none';
    }

    if (user.role === 'admin') {
      if (DOM.navTabAdmin) DOM.navTabAdmin.style.display = '';
      switchTab('tab-admin');
    } else {
      if (state.activeTab === 'tab-admin') {
        switchTab('tab-progress');
      }
      renderMentorBanner();
    }

    refreshAll();
  }

  function handleStudentLogin(name, password) {
    const res = registerOrLoginStudent(name, password);
    if (!res.success) {
      if (DOM.authError) {
        DOM.authError.textContent = res.message;
        DOM.authError.style.display = 'block';
      }
      return false;
    }

    const st = res.student;
    const user = {
      id: st.id,
      username: st.username || st.id,
      role: 'student',
      name: st.name,
      avatar: st.avatar || '🎓'
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    loadStudentDataIntoState(st);
    applyAuthenticatedUser(user);
    showToast(`Welcome, Aspirant ${st.name}! 🎓`);
    return true;
  }

  function handleAdminLogin(username, password) {
    const u = (username || '').trim().toLowerCase();
    const p = (password || '').trim();

    if (u === 'admin' && p === 'arav') {
      const user = { id: 'admin', username: 'admin', role: 'admin', name: 'Admin Command', avatar: '👑' };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      applyAuthenticatedUser(user);
      showToast('Welcome, Administrator! 👑');
      return true;
    } else {
      if (DOM.authError) {
        DOM.authError.textContent = 'Invalid Admin credentials. (Use admin / arav)';
        DOM.authError.style.display = 'block';
      }
      return false;
    }
  }

  function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    state.currentUser = null;
    state.userRole = 'student';
    showAuthScreen();
    showToast('Logged out successfully');
  }

  /* ============================================================
     STATE PERSISTENCE
  ============================================================ */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        theme: state.theme,
        lectures: state.lectures,
        mocks: state.mocks,
        dailyTargets: state.dailyTargets,
        dailyTimetables: state.dailyTimetables,
        streak: state.streak,
        lastActiveDate: state.lastActiveDate,
        mentorFeedback: state.mentorFeedback,
        mentorNoticeDismissed: state.mentorNoticeDismissed
      }));

      // Sync active student state to persistent student registry
      if (state.currentUser && state.currentUser.role === 'student' && state.currentUser.id) {
        const students = getRegisteredStudents();
        const st = students[state.currentUser.id];
        if (st) {
          st.lectures = state.lectures;
          st.mocks = state.mocks;
          st.dailyTargets = state.dailyTargets;
          st.dailyTimetables = state.dailyTimetables;
          st.streak = state.streak;
          st.lastActiveDate = todayStr();
          st.mentorFeedback = state.mentorFeedback;
          st.mentorNoticeDismissed = state.mentorNoticeDismissed;
          saveRegisteredStudents(students);
        }
      }
    } catch(e) { console.warn('Save error:', e); }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const p = JSON.parse(saved);
      if (p.theme) state.theme = p.theme;
      if (p.lectures) state.lectures = p.lectures;
      if (p.mocks) state.mocks = p.mocks;
      if (p.dailyTargets) state.dailyTargets = p.dailyTargets;
      if (p.dailyTimetables) state.dailyTimetables = p.dailyTimetables;
      if (p.streak) state.streak = p.streak;
      if (p.lastActiveDate) state.lastActiveDate = p.lastActiveDate;
      if (p.mentorFeedback !== undefined) state.mentorFeedback = p.mentorFeedback;
      if (p.mentorNoticeDismissed !== undefined) state.mentorNoticeDismissed = p.mentorNoticeDismissed;
    } catch(e) { console.warn('Load error:', e); }
    // Streak check
    const today = todayStr();
    if (state.lastActiveDate !== today) {
      const yesterday = offsetDate(today, -1);
      state.streak = state.lastActiveDate === yesterday ? (state.streak + 1) : 1;
      state.lastActiveDate = today;
      saveState();
    }
  }

  /* ============================================================
     THEME
  ============================================================ */
  function applyTheme(name) {
    state.theme = name;
    if (name === 'light') {
      document.body.classList.replace('theme-dark', 'theme-light');
      if (DOM.themeIcon) DOM.themeIcon.textContent = '🌙';
    } else {
      document.body.classList.replace('theme-light', 'theme-dark');
      if (DOM.themeIcon) DOM.themeIcon.textContent = '☀️';
    }
    saveState();
  }

  /* ============================================================
     ROLE SWITCHING (STUDENT vs ADMIN)
  ============================================================ */
  function setRole(role) {
    if (role === 'admin' && (!state.currentUser || state.currentUser.role !== 'admin')) {
      showToast('⚠️ Admin access requires admin login (admin / arav)');
      showAuthScreen();
      return;
    }

    state.userRole = role;
    if (DOM.roleStudentBtn) DOM.roleStudentBtn.classList.toggle('active', role === 'student');
    if (DOM.roleAdminBtn) {
      DOM.roleAdminBtn.classList.toggle('active', role === 'admin');
      DOM.roleAdminBtn.classList.toggle('role-admin-active', role === 'admin');
    }
    if (DOM.adminModeBanner) {
      DOM.adminModeBanner.style.display = role === 'admin' ? 'flex' : 'none';
    }

    if (role === 'admin') {
      switchTab('tab-admin');
      showToast('👑 Switched to Admin / Mentor Command');
    } else {
      if (state.activeTab === 'tab-admin') {
        switchTab('tab-progress');
      }
      renderMentorBanner();
      showToast('🎓 Switched to Student View');
    }
  }

  function renderMentorBanner() {
    if (!DOM.mentorNoticeBanner) return;
    if (state.userRole === 'student' && state.mentorFeedback && !state.mentorNoticeDismissed) {
      if (DOM.mentorNoticeText) DOM.mentorNoticeText.textContent = `"${state.mentorFeedback}"`;
      DOM.mentorNoticeBanner.style.display = 'flex';
    } else {
      DOM.mentorNoticeBanner.style.display = 'none';
    }
  }

  /* ============================================================
     PROGRESS CALCULATION
  ============================================================ */
  function getSubjectProgress(subjectId) {
    const sub = subjectMap[subjectId];
    if (!sub) return { percent: 0, watched: 0, notes: 0, revision: 0, question: 0, totalLectures: 0 };
    const rows = masterLectures.filter(r => r.subjectId === subjectId);
    let w=0, n=0, rv=0, q=0;
    rows.forEach(row => {
      const p = state.lectures[row.sNo] || {};
      if (p.watched) w++;
      if (p.notes) n++;
      if (p.revision) rv++;
      if (p.question) q++;
    });
    const total = sub.totalLectures * 4;
    const done = w+n+rv+q;
    return {
      percent: total > 0 ? (done/total)*100 : 0,
      watched: w, notes: n, revision: rv, question: q,
      totalLectures: sub.totalLectures
    };
  }

  function computeOverall() {
    let totalW=0, totalN=0, totalR=0, totalQ=0, fullyDone=0;
    masterLectures.forEach(row => {
      const p = state.lectures[row.sNo] || {};
      if (p.watched) totalW++;
      if (p.notes) totalN++;
      if (p.revision) totalR++;
      if (p.question) totalQ++;
      if (p.watched && p.notes && p.revision && p.question) fullyDone++;
    });
    const totalMilestones = masterLectures.length * 4;
    const done = totalW+totalN+totalR+totalQ;
    const pct = totalMilestones > 0 ? (done/totalMilestones)*100 : 0;
    let mocksCount = 0;
    let totalScoreSum = 0;
    let scoredMocksCount = 0;
    Object.values(state.mocks).forEach(m => {
      let paperAttempted = false;
      [1, 2, 3].forEach(n => {
        const mark = parseFloat(m['a' + n + '_mark']);
        if (!isNaN(mark)) {
          totalScoreSum += mark;
          scoredMocksCount++;
          paperAttempted = true;
        } else if (m['a' + n + '_mark']) {
          paperAttempted = true;
        }
      });
      if (paperAttempted) mocksCount++;
    });
    const avgScore = scoredMocksCount > 0 ? (totalScoreSum / scoredMocksCount).toFixed(1) : null;
    return { pct, totalMilestones, done, totalW, totalN, totalR, totalQ, fullyDone, mocksCount, avgScore };
  }

  function computeTaskAdherence() {
    let total = 0;
    let done = 0;
    Object.values(state.dailyTargets).forEach(list => {
      if (Array.isArray(list)) {
        list.forEach(t => {
          total++;
          if (t.completed) done++;
        });
      }
    });
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, rate };
  }

  /* ============================================================
     HERO / NAV METRICS UPDATE
  ============================================================ */
  function updateAllHeroMetrics() {
    const o = computeOverall();
    // Hero stats
    if (DOM.statOverallPct) DOM.statOverallPct.textContent = `${o.pct.toFixed(1)}%`;
    if (DOM.statStagesDone) DOM.statStagesDone.textContent = `${o.done.toLocaleString()} / ${o.totalMilestones.toLocaleString()} stages`;
    if (DOM.statLecturesDone) DOM.statLecturesDone.textContent = o.totalW;
    if (DOM.statNotesDone) DOM.statNotesDone.textContent = o.totalN;
    if (DOM.statRevisionDone) DOM.statRevisionDone.textContent = o.totalR;
    if (DOM.statQuestionsDone) DOM.statQuestionsDone.textContent = o.totalQ;
    if (DOM.statMocksAttempted) DOM.statMocksAttempted.textContent = o.mocksCount;
    if (DOM.statTotalLecturesSub) DOM.statTotalLecturesSub.textContent = `of ${masterLectures.length.toLocaleString()} lectures`;
    if (DOM.statTotalNotesSub) DOM.statTotalNotesSub.textContent = `of ${masterLectures.length.toLocaleString()} completed`;
    // Badges
    if (DOM.badgeOverallPct) DOM.badgeOverallPct.textContent = `${Math.round(o.pct)}%`;
    if (DOM.badgeLectureCount) DOM.badgeLectureCount.textContent = `${o.fullyDone}/${masterLectures.length}`;
    if (DOM.badgeMockCount) DOM.badgeMockCount.textContent = `${o.mocksCount}/1,243`;
    // Radial gauge
    if (DOM.radialProgressCircle) {
      const circ = 440;
      DOM.radialProgressCircle.style.strokeDashoffset = circ - (o.pct/100)*circ;
    }
    if (DOM.radialProgressText) DOM.radialProgressText.textContent = `${Math.round(o.pct)}%`;
    // Rank badge
    let rank = '🌱 Aspirant Kickoff';
    if (o.pct >= 95) rank = '🏆 Selected Officer!';
    else if (o.pct >= 75) rank = '⚔️ Master Rank Aspirant';
    else if (o.pct >= 50) rank = '🎯 Revision Specialist';
    else if (o.pct >= 25) rank = '⚡ Consistent Grinder';
    else if (o.pct >= 10) rank = '🔥 Foundation Builder';
    if (DOM.aspirantRankBadge) DOM.aspirantRankBadge.textContent = rank;

    // Admin alerts badge
    const adh = computeTaskAdherence();
    if (DOM.badgeAdminAlerts) {
      DOM.badgeAdminAlerts.textContent = `${adh.rate}% Done`;
    }
  }

  /* ============================================================
     COUNTDOWN
  ============================================================ */
  function updateCountdown() {
    if (DOM.targetStartDate) DOM.targetStartDate.textContent = formatDate(TIMELINE_START);
    if (DOM.targetEndDate) DOM.targetEndDate.textContent = formatDate(TIMELINE_END);
    if (!DOM.targetCountdown) return;
    const diff = new Date(TIMELINE_END + 'T23:59:59') - new Date();
    if (diff <= 0) { DOM.targetCountdown.innerHTML = '🏆 Target Reached!'; return; }
    const days = Math.floor(diff/(1000*60*60*24));
    const hrs  = Math.floor((diff%(1000*60*60*24))/(1000*60*60));
    DOM.targetCountdown.innerHTML = `⏳ <strong>${days}d ${hrs}h</strong> remaining`;
  }

  /* ============================================================
     SUBJECT CARDS
  ============================================================ */
  function populateSubjectDropdowns() {
    const subOpts = STUDY_DATA.subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name} (${s.totalLectures})</option>`).join('');

    // Admin lecture subject dropdown
    if (DOM.adminLectureSubjectSelect) {
      DOM.adminLectureSubjectSelect.innerHTML = subOpts;
      updateAdminLectureDropdown();
    }

    if (DOM.adminCustomTaskSubject) {
      DOM.adminCustomTaskSubject.innerHTML = '<option value="">None / General Task</option>' + subOpts;
    }

    if (DOM.slotAssignedSubject) DOM.slotAssignedSubject.innerHTML =
      '<option value="">None / General</option>' +
      STUDY_DATA.subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');

    if (DOM.adminSlotSubject) DOM.adminSlotSubject.innerHTML =
      '<option value="">None / General</option>' +
      STUDY_DATA.subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');

    if (DOM.todoSubjectFilter) {
      DOM.todoSubjectFilter.innerHTML = `<option value="ALL">All Subjects (${masterLectures.length} Lectures)</option>` +
        STUDY_DATA.subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name} (${s.totalLectures})</option>`).join('');
    }
  }

  function renderSubjectCards() {
    if (!DOM.subjectCardsGrid) return;
    const filter = DOM.subjectCategoryFilter ? DOM.subjectCategoryFilter.value : 'ALL';
    const subjects = filter === 'ALL' ? STUDY_DATA.subjects : STUDY_DATA.subjects.filter(s => s.category.toLowerCase() === filter.toLowerCase());
    DOM.subjectCardsGrid.innerHTML = subjects.map(sub => {
      const st = getSubjectProgress(sub.id);
      const pct = st.percent.toFixed(1);
      const complete = st.percent >= 100;
      return `
      <div class="subject-card ${complete ? 'completed-subject' : ''}" style="--subject-color:${sub.color};">
        <div class="subject-card-header">
          <div class="subject-title-area">
            <span class="subject-icon">${sub.icon}</span>
            <div>
              <h3 class="subject-name">${sub.name}</h3>
              <span class="subject-category">${sub.category} • ${sub.totalLectures} Lectures</span>
            </div>
          </div>
          <div class="subject-percentage-pill">${pct}%</div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${sub.color};"></div>
        </div>
        <div class="milestones-mini-grid">
          <div class="mini-stat"><span class="label">🎥 Watched</span><span class="value">${st.watched}/${sub.totalLectures}</span></div>
          <div class="mini-stat"><span class="label">📝 Notes</span><span class="value">${st.notes}/${sub.totalLectures}</span></div>
          <div class="mini-stat"><span class="label">🔁 Revision</span><span class="value">${st.revision}/${sub.totalLectures}</span></div>
          <div class="mini-stat"><span class="label">✍️ Qns</span><span class="value">${st.question}/${sub.totalLectures}</span></div>
        </div>
        <div class="subject-card-footer">
          <button class="btn btn-secondary btn-sm btn-view-lectures" data-id="${sub.id}">📋 View Lectures</button>
          <button class="btn btn-primary btn-sm btn-set-target" data-id="${sub.id}">🎯 + Add to Daily</button>
        </div>
      </div>`;
    }).join('');
    // Wire buttons
    DOM.subjectCardsGrid.querySelectorAll('.btn-view-lectures').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab('tab-todo');
        if (DOM.todoSubjectFilter) { DOM.todoSubjectFilter.value = btn.dataset.id; }
        state.todoSubject = btn.dataset.id;
        state.currentPage = 1;
        renderSyllabus();
      });
    });
    DOM.subjectCardsGrid.querySelectorAll('.btn-set-target').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab('tab-todo');
        if (DOM.todoSubjectFilter) { DOM.todoSubjectFilter.value = btn.dataset.id; }
        state.todoSubject = btn.dataset.id;
        state.currentPage = 1;
        renderSyllabus();
        showToast(`Select any lecture below to add to Daily Targets`);
      });
    });
  }

  /* ============================================================
     DAILY TARGETS (DATE + DIRECT LECTURES ONLY)
  ============================================================ */
  function getDayTargets() {
    return state.dailyTargets[state.selectedTargetDate] || [];
  }

  function renderDailyTargets() {
    if (!DOM.dailyTasksList) return;
    const curDate = state.selectedTargetDate;
    const isToday = curDate === todayStr();
    if (DOM.dailyTaskDatePicker) DOM.dailyTaskDatePicker.value = curDate;
    if (DOM.targetDayName) DOM.targetDayName.textContent = isToday ? 'Today' : formatDate(curDate);
    if (DOM.selectedDateLabel) DOM.selectedDateLabel.textContent = isToday ? "Today's Assigned Lectures" : `${formatDate(curDate)} Assigned Lectures`;
    const targets = getDayTargets();

    // Filter
    let filtered = targets;
    switch (state.dailyFilter) {
      case 'ADMIN':     filtered = targets.filter(t => t.assignedByAdmin); break;
      case 'PENDING':   filtered = targets.filter(t => !t.completed); break;
      case 'COMPLETED': filtered = targets.filter(t => t.completed); break;
    }

    // Progress Ring & Counts
    const total = targets.length;
    const done  = targets.filter(t => t.completed).length;
    const pct   = total > 0 ? Math.round((done/total)*100) : 0;
    if (DOM.dailyTasksSummaryText) DOM.dailyTasksSummaryText.textContent = `${done} of ${total} Completed (${pct}%)`;
    if (DOM.badgeDailyTasksCount) DOM.badgeDailyTasksCount.textContent = `${done}/${total}`;
    if (DOM.dailyProgressRingCircle) {
      const circ = 327;
      DOM.dailyProgressRingCircle.style.strokeDashoffset = circ - (pct/100)*circ;
    }
    if (DOM.dailyProgressRingText) DOM.dailyProgressRingText.textContent = `${pct}%`;
    if (DOM.dailyCompletionStatusMsg) {
      if (total === 0) DOM.dailyCompletionStatusMsg.textContent = 'No lecture targets yet for this day.';
      else if (done === total) DOM.dailyCompletionStatusMsg.textContent = '🎉 All lecture targets finished! Outstanding!';
      else DOM.dailyCompletionStatusMsg.textContent = `${total-done} lecture${total-done===1?'':'s'} remaining.`;
    }
    if (DOM.dailyStreakCount) DOM.dailyStreakCount.textContent = state.streak;

    // Empty state
    if (targets.length === 0) {
      DOM.dailyTasksList.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🎯</div>
          <h4>No Lectures Assigned for ${isToday ? 'Today' : formatDate(curDate)}</h4>
          <p>Click below or go to <strong>Master Syllabus</strong> to add specific lectures to this date.</p>
          <button id="emptyGoToSyllabusBtn" class="btn btn-primary btn-sm" style="margin-top:0.75rem;">📋 Browse 1,345 Lectures</button>
        </div>`;
      const btn = $('emptyGoToSyllabusBtn');
      if (btn) btn.addEventListener('click', () => switchTab('tab-todo'));
      renderGainsLog([]);
      return;
    }

    if (filtered.length === 0) {
      DOM.dailyTasksList.innerHTML = `<div class="empty-state-card" style="padding:1.5rem;"><p>No tasks match the filter <strong>${state.dailyFilter}</strong>.</p></div>`;
      renderGainsLog(targets);
      return;
    }

    DOM.dailyTasksList.innerHTML = filtered.map(t => {
      const isDone = !!t.completed;
      const sub = t.subjectId ? subjectMap[t.subjectId] : null;
      const isCustom = !!t.isCustomTask;
      const subPill = sub ? `<span class="task-subject-pill" style="--task-sub-bg:${sub.color}18;--task-sub-color:${sub.color};--task-sub-border:${sub.color}44;">${sub.icon} ${sub.name}</span>` : '';
      const adminPill = t.assignedByAdmin ? `<span class="task-admin-pill">👑 Admin Assigned</span>` : '';
      const customPill = isCustom ? `<span class="task-custom-pill">⚡ Custom</span>` : '';
      const priClass = t.priority === 'urgent' ? 'urgent' : t.priority === 'high' ? 'high' : 'normal';
      const subProg = sub ? getSubjectProgress(sub.id) : null;

      // Lecture row milestone info if available
      let milestoneInfo = '';
      if (t.sNo && state.lectures[t.sNo]) {
        const p = state.lectures[t.sNo];
        const stagesDone = [p.watched, p.notes, p.revision, p.question].filter(Boolean).length;
        milestoneInfo = `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:0.4rem;">(${stagesDone}/4 stages completed)</span>`;
      }

      return `
      <div class="daily-task-card ${isDone ? 'is-completed' : ''} ${t.assignedByAdmin ? 'is-admin-task' : ''}" data-tid="${t.id}">
        <div class="task-checkbox-area">
          <input type="checkbox" class="custom-checkbox task-chk" data-tid="${t.id}" ${isDone ? 'checked' : ''}>
        </div>
        <div class="task-main-info">
          <div class="task-meta-top">
            ${subPill}
            ${customPill}
            ${adminPill}
            <span class="task-priority-pill ${priClass}">${t.priority || 'Normal'}</span>
            ${t.sNo ? `<span class="task-slot-pill">#Lec ${t.sNo}</span>` : ''}
            ${t.hours ? `<span class="task-slot-pill">⏱️ ${esc(t.hours)}</span>` : ''}
          </div>
          <div class="task-title ${isDone ? 'done-title' : ''}">${esc(t.title)} ${milestoneInfo}</div>
          ${t.adminNote ? `<div class="task-admin-note">📌 <strong>Mentor Instruction:</strong> ${esc(t.adminNote)}</div>` : ''}
          ${sub && subProg ? `<div class="task-impact-badge">📊 ${sub.name}: ${subProg.percent.toFixed(1)}% complete</div>` : ''}
        </div>
        <div class="task-actions">
          <button class="btn-task-del task-del-btn" data-tid="${t.id}" title="Remove task">✕</button>
        </div>
      </div>`;
    }).join('');

    // Listeners
    DOM.dailyTasksList.querySelectorAll('.task-chk').forEach(chk => {
      chk.addEventListener('change', () => toggleTarget(chk.dataset.tid, chk.checked));
    });
    DOM.dailyTasksList.querySelectorAll('.task-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteTarget(btn.dataset.tid));
    });
    renderGainsLog(targets);
  }

  function addTarget(t, dateOverride) {
    const d = dateOverride || state.selectedTargetDate;
    if (!state.dailyTargets[d]) state.dailyTargets[d] = [];

    // Avoid duplicate assignment of same lecture on same date
    if (t.sNo && state.dailyTargets[d].some(x => x.sNo === t.sNo)) {
      showToast(`Lecture #${t.sNo} is already assigned for ${formatDate(d)}!`);
      return;
    }

    state.dailyTargets[d].push({ id: uid(), date: d, completed: false, ...t });
    saveState();
    renderDailyTargets();
    if (state.activeTab === 'tab-admin') renderAdminView();
    showToast(`Lecture added to targets for ${formatDate(d)} ✅`);
  }

  function toggleTarget(tid, done) {
    const list = getDayTargets();
    const t = list.find(x => x.id === tid);
    if (!t) return;
    t.completed = done;

    // Directly sync with subject lecture progress
    if (t.sNo) {
      if (!state.lectures[t.sNo]) {
        state.lectures[t.sNo] = { watched: false, notes: false, revision: false, question: false };
      }
      if (done) {
        state.lectures[t.sNo].watched = true;
        state.lectures[t.sNo].notes = true;
      }
    }

    saveState();
    updateAllHeroMetrics();
    renderSubjectCards();
    renderDailyTargets();
    renderSyllabus();
    if (state.activeTab === 'tab-admin') renderAdminView();
    if (done && list.every(x => x.completed)) celebrate('Daily Target 100%! 🎯', 'All planned lecture targets finished!');
  }

  function deleteTarget(tid, dateStr) {
    const d = dateStr || state.selectedTargetDate;
    if (!state.dailyTargets[d]) return;
    state.dailyTargets[d] = state.dailyTargets[d].filter(x => x.id !== tid);
    saveState();
    renderDailyTargets();
    if (state.activeTab === 'tab-admin') renderAdminView();
    showToast('Lecture target removed');
  }

  function addLectureToDaily(sNo) {
    const row = masterLectures.find(r => r.sNo === sNo);
    if (!row) return;

    const isAdmin = state.userRole === 'admin';
    const targetDate = isAdmin ? (state.selectedAdminRoutineDate || todayStr()) : state.selectedTargetDate;

    addTarget({
      sNo: row.sNo,
      type: 'study',
      category: 'study',
      title: row.title,
      subjectId: row.subjectId,
      hours: '1.5 hrs',
      priority: isAdmin ? 'high' : 'normal',
      assignedByAdmin: isAdmin,
      adminNote: isAdmin ? 'Assigned from Master Syllabus' : ''
    }, targetDate);

    showToast(`"${row.title}" → added to ${formatDate(targetDate)} 🎯`);
  }

  function renderGainsLog(targets) {
    if (!DOM.todaySubjectGainsList) return;
    const withSub = targets.filter(t => t.completed && t.subjectId);
    if (withSub.length === 0) {
      DOM.todaySubjectGainsList.innerHTML = '<p class="muted-text">No completed lectures yet.</p>';
      return;
    }
    const grouped = {};
    withSub.forEach(t => { grouped[t.subjectId] = (grouped[t.subjectId] || 0) + 1; });
    DOM.todaySubjectGainsList.innerHTML = Object.entries(grouped).map(([id, cnt]) => {
      const sub = subjectMap[id];
      if (!sub) return '';
      const prog = getSubjectProgress(id);
      return `<div class="gain-row"><span>${sub.icon} <strong>${sub.name}</strong> (${cnt})</span><span style="color:var(--accent-emerald);font-weight:800;">${prog.percent.toFixed(1)}%</span></div>`;
    }).join('');
  }

  /* ============================================================
     MASTER SYLLABUS TABLE
  ============================================================ */
  function getFilteredLectures() {
    return masterLectures.filter(row => {
      if (state.todoSubject !== 'ALL' && row.subjectId !== state.todoSubject) return false;
      if (state.todoSearch) {
        const q = state.todoSearch.toLowerCase();
        if (!(`${row.sNo} ${row.title} ${row.subtopic}`).toLowerCase().includes(q)) return false;
      }
      if (state.todoFilter !== 'ALL') {
        const p = state.lectures[row.sNo] || {};
        const done = p.watched && p.notes && p.revision && p.question;
        const started = p.watched || p.notes || p.revision || p.question;
        if (state.todoFilter === 'DONE' && !done) return false;
        if (state.todoFilter === 'IN_PROGRESS' && (!started || done)) return false;
        if (state.todoFilter === 'UNSTARTED' && started) return false;
      }
      return true;
    });
  }

  function renderSyllabus() {
    if (!DOM.todoTableBody) return;
    const filtered = getFilteredLectures();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const start = (state.currentPage - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);
    // Counts
    let doneCount = 0;
    filtered.forEach(r => {
      const p = state.lectures[r.sNo] || {};
      if (p.watched && p.notes && p.revision && p.question) doneCount++;
    });
    const donePct = total > 0 ? ((doneCount/total)*100).toFixed(1) : '0.0';
    if (DOM.visibleRowCount) DOM.visibleRowCount.textContent = total.toLocaleString();
    if (DOM.totalMasterLecturesCount) DOM.totalMasterLecturesCount.textContent = masterLectures.length.toLocaleString();
    if (DOM.visiblePct) DOM.visiblePct.textContent = `${donePct}%`;
    if (DOM.currentPageNum) DOM.currentPageNum.textContent = state.currentPage;
    if (DOM.totalPagesNum) DOM.totalPagesNum.textContent = totalPages;
    if (DOM.prevPageBtn) DOM.prevPageBtn.disabled = state.currentPage <= 1;
    if (DOM.nextPageBtn) DOM.nextPageBtn.disabled = state.currentPage >= totalPages;

    DOM.todoTableBody.innerHTML = pageRows.map(row => {
      const p = state.lectures[row.sNo] || {};
      const sub = subjectMap[row.subjectId] || {};
      const fullyDone = p.watched && p.notes && p.revision && p.question;
      const started   = p.watched || p.notes || p.revision || p.question;
      const doneStages = [p.watched,p.notes,p.revision,p.question].filter(Boolean).length;
      const rowPct = (doneStages/4)*100;
      let badge = `<span class="status-badge pending">Pending</span>`;
      if (fullyDone) badge = `<span class="status-badge completed">Done ✅</span>`;
      else if (started) badge = `<span class="status-badge in-progress">Active ⚡</span>`;
      return `
      <tr class="${fullyDone ? 'lecture-fully-done' : ''}" data-sno="${row.sNo}">
        <td data-label="S.No"><small style="font-family:var(--font-mono);color:var(--text-muted);">#${row.sNo}</small></td>
        <td data-label="Lecture" class="lecture-title-cell">
          <div style="font-weight:700;font-size:0.82rem;">${esc(row.title)}</div>
          <div style="font-size:0.68rem;color:var(--text-muted);display:flex;align-items:center;gap:0.3rem;margin-top:0.15rem;">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${sub.color||'#38bdf8'};"></span>${sub.name||row.subjectId}
          </div>
        </td>
        <td data-label="Watch" class="stage-check-cell"><input type="checkbox" class="custom-checkbox lec-chk" data-sno="${row.sNo}" data-stage="watched" ${p.watched?'checked':''}></td>
        <td data-label="Notes" class="stage-check-cell"><input type="checkbox" class="custom-checkbox lec-chk" data-sno="${row.sNo}" data-stage="notes" ${p.notes?'checked':''}></td>
        <td data-label="Revise" class="stage-check-cell"><input type="checkbox" class="custom-checkbox lec-chk" data-sno="${row.sNo}" data-stage="revision" ${p.revision?'checked':''}></td>
        <td data-label="Qns" class="stage-check-cell"><input type="checkbox" class="custom-checkbox lec-chk" data-sno="${row.sNo}" data-stage="question" ${p.question?'checked':''}></td>
        <td data-label="Progress">
          <div class="row-progress-wrap">
            <div class="row-progress-label">${doneStages}/4</div>
            <div class="row-progress-bg"><div class="row-progress-fill" style="width:${rowPct}%;"></div></div>
          </div>
        </td>
        <td data-label="Status">${badge}</td>
        <td data-label="Action"><button class="btn-add-daily add-to-daily-btn" data-sno="${row.sNo}">➕ Daily</button></td>
      </tr>`;
    }).join('');
    // Listeners
    DOM.todoTableBody.querySelectorAll('.lec-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const sNo = parseInt(chk.dataset.sno, 10);
        const stage = chk.dataset.stage;
        if (!state.lectures[sNo]) state.lectures[sNo] = { watched:false, notes:false, revision:false, question:false };
        state.lectures[sNo][stage] = chk.checked;
        saveState();
        updateAllHeroMetrics();
        renderSubjectCards();
        renderSyllabus();
        if (state.activeTab === 'tab-admin') renderAdminView();
      });
    });
    DOM.todoTableBody.querySelectorAll('.add-to-daily-btn').forEach(btn => {
      btn.addEventListener('click', () => addLectureToDaily(parseInt(btn.dataset.sno, 10)));
    });
  }

  /* ============================================================
     TIMETABLE
  ============================================================ */
  function renderTimetable() {
    if (!DOM.timelineList) return;
    const curDate = state.selectedTimetableDate;
    const isToday = curDate === todayStr();
    if (DOM.ttDatePicker) DOM.ttDatePicker.value = curDate;
    if (DOM.ttDayTitle) DOM.ttDayTitle.textContent = isToday ? 'Schedule for Today' : `Schedule for ${formatDate(curDate)}`;
    const slots = (state.dailyTimetables[curDate] || []).slice().sort((a,b) => a.startMin - b.startMin);
    if (DOM.timetableSlotCount) DOM.timetableSlotCount.textContent = slots.length;
    // Hours calc
    let study=0, work=0, coaching=0, rest=0, total=0;
    slots.forEach(s => {
      const dur = parseSlotDur(s.time);
      total += dur;
      if (s.category === 'study') study += dur;
      else if (s.category === 'work') work += dur;
      else if (s.category === 'coaching') coaching += dur;
      else rest += dur;
    });
    const setHrStat = (el, h, pct) => { if (el) el.textContent = `${h.toFixed(1)}h (${pct.toFixed(0)}%)`; };
    setHrStat(DOM.statTimetableStudyHrs, study, total>0?(study/total)*100:0);
    setHrStat(DOM.statTimetableWorkHrs, work, total>0?(work/total)*100:0);
    setHrStat(DOM.statTimetableCoachingHrs, coaching, total>0?(coaching/total)*100:0);
    setHrStat(DOM.statTimetableRestHrs, rest, total>0?(rest/total)*100:0);
    if (DOM.fillTimetableStudy) DOM.fillTimetableStudy.style.width = total>0?`${(study/total)*100}%`:'0%';
    if (DOM.fillTimetableWork) DOM.fillTimetableWork.style.width = total>0?`${(work/total)*100}%`:'0%';
    if (DOM.fillTimetableCoaching) DOM.fillTimetableCoaching.style.width = total>0?`${(coaching/total)*100}%`:'0%';
    if (DOM.fillTimetableRest) DOM.fillTimetableRest.style.width = total>0?`${(rest/total)*100}%`:'0%';
    if (DOM.badgeTimetableStudyHrs) DOM.badgeTimetableStudyHrs.textContent = `${study.toFixed(1)}h`;
    if (slots.length === 0) {
      DOM.timelineList.innerHTML = `<div class="empty-state-card"><div class="empty-icon">⏰</div><h4>No Timetable for ${isToday?'Today':formatDate(curDate)}</h4><p>Add time slots or request your Mentor to schedule a routine.</p></div>`;
      return;
    }
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    DOM.timelineList.innerHTML = slots.map(s => {
      let isActive = false;
      if (isToday && s.startMin !== undefined) {
        const endMin = s.endMin !== undefined ? s.endMin : s.startMin+60;
        isActive = nowMin >= s.startMin && nowMin < endMin;
      }
      const sub = s.assignedSubject ? subjectMap[s.assignedSubject] : null;
      const dur = parseSlotDur(s.time);
      const adminBadge = s.assignedByAdmin ? `<span class="slot-admin-badge">👑 Mentor Scheduled</span>` : '';
      return `
      <div class="timeline-item ${isActive ? 'active-slot' : ''} ${s.completed ? 'is-completed' : ''} ${s.assignedByAdmin ? 'is-admin-slot' : ''}" data-sid="${s.id}">
        <input type="checkbox" class="custom-checkbox slot-chk" data-sid="${s.id}" ${s.completed ? 'checked' : ''}>
        <div class="time-slot"><div>${s.time}</div><div style="font-size:0.68rem;">${dur}h</div></div>
        <div class="time-activity">
          <div class="time-title" style="${s.completed?'text-decoration:line-through;opacity:.6;':''}">${s.icon||'⚡'} ${esc(s.label)}</div>
          ${s.desc ? `<div class="time-desc">${esc(s.desc)}</div>` : ''}
          <div>
            ${adminBadge}
            ${sub ? `<div class="slot-subject-badge" style="background:${sub.color}18;color:${sub.color};border:1px solid ${sub.color}44;">${sub.icon} ${sub.name}</div>` : ''}
          </div>
        </div>
        <span class="time-tag ${s.category}">${s.category}</span>
        <div style="display:flex;gap:0.3rem;flex-shrink:0;">
          <button class="btn btn-secondary btn-xs slot-edit-btn" data-sid="${s.id}">✏️</button>
          <button class="btn btn-danger btn-xs slot-del-btn" data-sid="${s.id}">🗑️</button>
        </div>
      </div>`;
    }).join('');
    DOM.timelineList.querySelectorAll('.slot-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const slot = getSlot(chk.dataset.sid);
        if (slot) { slot.completed = chk.checked; saveState(); renderTimetable(); if (state.activeTab === 'tab-admin') renderAdminView(); }
      });
    });
    DOM.timelineList.querySelectorAll('.slot-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openSlotModalFor(btn.dataset.sid));
    });
    DOM.timelineList.querySelectorAll('.slot-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = state.selectedTimetableDate;
        state.dailyTimetables[d] = (state.dailyTimetables[d]||[]).filter(s => s.id !== btn.dataset.sid);
        saveState(); renderTimetable(); if (state.activeTab === 'tab-admin') renderAdminView(); showToast('Slot deleted');
      });
    });
  }

  function getSlot(sid) {
    const slots = state.dailyTimetables[state.selectedTimetableDate] || [];
    return slots.find(s => s.id === sid);
  }
  function parseSlotDur(timeStr) {
    if (!timeStr || !timeStr.includes('-')) return 1;
    const [a,b] = timeStr.split('-').map(s => s.trim());
    const [h1,m1] = a.split(':').map(Number);
    const [h2,m2] = b.split(':').map(Number);
    let diff = (h2 + (m2||0)/60) - (h1 + (m1||0)/60);
    if (diff < 0) diff += 24;
    return Math.round(diff * 10) / 10;
  }
  function timeToMin(t) {
    if (!t) return 0;
    const [h,m] = t.split(':').map(Number);
    return h*60 + (m||0);
  }

  function openSlotModalFor(sid) {
    const curDate = state.selectedTimetableDate;
    const slots = state.dailyTimetables[curDate] || [];
    if (sid) {
      const slot = slots.find(s => s.id === sid);
      if (!slot) return;
      DOM.slotModalTitle.textContent = 'Edit Slot';
      DOM.editSlotId.value = sid;
      const [a,b] = slot.time.split(' - ');
      DOM.slotStartTime.value = a || '09:00';
      DOM.slotEndTime.value = b || '10:00';
      DOM.slotLabel.value = slot.label || '';
      DOM.slotCategory.value = slot.category || 'study';
      DOM.slotIcon.value = slot.icon || '📖';
      DOM.slotAssignedSubject.value = slot.assignedSubject || '';
      DOM.slotDesc.value = slot.desc || '';
    } else {
      DOM.slotModalTitle.textContent = `Add Slot — ${formatDate(curDate)}`;
      DOM.editSlotId.value = '';
      DOM.slotStartTime.value = '09:00';
      DOM.slotEndTime.value = '11:00';
      DOM.slotLabel.value = '';
      DOM.slotCategory.value = 'study';
      DOM.slotIcon.value = '📖';
      DOM.slotAssignedSubject.value = '';
      DOM.slotDesc.value = '';
    }
    DOM.slotEditorModal.classList.add('active');
  }

  function saveSlot(e) {
    e.preventDefault();
    const curDate = state.selectedTimetableDate;
    if (!state.dailyTimetables[curDate]) state.dailyTimetables[curDate] = [];
    const startTime = DOM.slotStartTime.value;
    const endTime = DOM.slotEndTime.value;
    const timeStr = `${startTime} - ${endTime}`;
    const slotData = {
      time: timeStr,
      startMin: timeToMin(startTime),
      endMin: timeToMin(endTime),
      label: DOM.slotLabel.value.trim(),
      category: DOM.slotCategory.value,
      icon: DOM.slotIcon.value.trim() || '⚡',
      assignedSubject: DOM.slotAssignedSubject.value,
      desc: DOM.slotDesc.value.trim(),
      completed: false
    };
    const editId = DOM.editSlotId.value;
    if (editId) {
      const idx = state.dailyTimetables[curDate].findIndex(s => s.id === editId);
      if (idx !== -1) Object.assign(state.dailyTimetables[curDate][idx], slotData);
    } else {
      state.dailyTimetables[curDate].push({ id: uid(), ...slotData });
    }
    saveState();
    DOM.slotEditorModal.classList.remove('active');
    renderTimetable();
    if (state.activeTab === 'tab-admin') renderAdminView();
    showToast('Slot saved ✅');
  }

  /* ============================================================
     MOCK TESTS
  ============================================================ */
  function renderMockSeriesTabs() {
    if (!DOM.mockSeriesTabs) return;
    DOM.mockSeriesTabs.innerHTML = STUDY_DATA.mockSeries.map(s =>
      `<button class="mock-tab-btn ${s.id===state.selectedMockSeries?'active':''}" data-sid="${s.id}">${s.name} (${s.count})</button>`
    ).join('');
    DOM.mockSeriesTabs.querySelectorAll('.mock-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedMockSeries = btn.dataset.sid;
        renderMockSeriesTabs();
        renderMockTable();
      });
    });
  }

  function renderMockTable() {
    if (!DOM.mockPapersGrid) return;
    const series = STUDY_DATA.mockSeries.find(s => s.id === state.selectedMockSeries) || STUDY_DATA.mockSeries[0];
    if (DOM.mockSeriesInfo) DOM.mockSeriesInfo.textContent = `${series.name} • ${series.count} Papers • S.No: ${series.sNoRange}`;
    const q = DOM.mockSearchInput ? DOM.mockSearchInput.value.toLowerCase() : '';
    let html = '';
    for (let i = 1; i <= series.count; i++) {
      const key = `${series.id}_p${i}`;
      const name = `${series.name} - Paper #${String(i).padStart(2,'0')}`;
      if (q && !name.toLowerCase().includes(q)) continue;
      const d = state.mocks[key] || {};
      html += `
      <div class="mock-paper-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">
          <div style="font-weight:800;font-size:.88rem;">${name}</div>
          <span style="font-size:.65rem;color:#38bdf8;background:rgba(56,189,248,.1);padding:.1rem .4rem;border-radius:999px;">3 Attempts</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">
          ${[1,2,3].map(n => `
          <div style="background:var(--bg-card);padding:.4rem;border-radius:6px;text-align:center;">
            <div style="font-size:.6rem;color:var(--text-muted);font-weight:700;margin-bottom:.3rem;">ATTEMPT ${n}</div>
            <input type="text" class="mock-input" data-key="${key}" data-field="a${n}_mark" placeholder="Score" value="${d['a'+n+'_mark']||''}">
            <input type="text" class="mock-input" data-key="${key}" data-field="a${n}_date" placeholder="Date" value="${d['a'+n+'_date']||''}">
          </div>`).join('')}
        </div>
      </div>`;
    }
    DOM.mockPapersGrid.innerHTML = html || '<div class="empty-state-card"><p>No papers match your search.</p></div>';
    DOM.mockPapersGrid.querySelectorAll('.mock-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.key; const field = inp.dataset.field;
        if (!state.mocks[key]) state.mocks[key] = {};
        state.mocks[key][field] = inp.value.trim();
        saveState(); updateAllHeroMetrics();
        if (state.activeTab === 'tab-admin') renderAdminView();
      });
    });
  }

  /* ============================================================
     TROPHIES
  ============================================================ */
  function renderTrophies() {
    if (!DOM.trophiesGrid) return;
    const o = computeOverall();
    const milestones = [
      { pct:0,   title:'Aspirant Kickoff',      desc:'Beginning Mission 2026-2027',           icon:'🌱' },
      { pct:10,  title:'Foundation Builder',     desc:'500+ milestones completed',             icon:'🔥' },
      { pct:25,  title:'Consistent Grinder',     desc:'25% of full syllabus mastered',         icon:'⚡' },
      { pct:50,  title:'Revision Specialist',    desc:'Halfway mark achieved!',                icon:'🎯' },
      { pct:75,  title:'Master Rank Aspirant',   desc:'Top-tier discipline & consistency',     icon:'⚔️' },
      { pct:100, title:'Selected Officer 👑',    desc:'All 1,345 lectures & 1,243 papers done',icon:'🏆' }
    ];
    DOM.trophiesGrid.innerHTML = milestones.map(m => {
      const unlocked = o.pct >= m.pct;
      return `
      <div class="trophy-card ${unlocked?'unlocked':''}">
        <div class="trophy-icon">${m.icon}</div>
        <div class="trophy-title">${m.title}</div>
        <div class="trophy-status" style="color:${unlocked?'var(--accent-emerald)':'var(--text-muted)'};">${unlocked?'UNLOCKED ✅':`Requires ${m.pct}%`}</div>
        <div class="trophy-desc">${m.desc}</div>
      </div>`;
    }).join('');
  }

  /* ============================================================
     ADMIN COMPONENT LOGIC
     1. Performance Monitoring
     2. Direct Lecture Task Assignment (1,345 Lectures)
     3. Daily Routine & Timetable Injector
  ============================================================ */

  // 1. PERFORMANCE MONITORING & OVERVIEW
  function renderAdminView() {
    const students = getRegisteredStudents();
    const studentKeys = Object.keys(students);

    if (studentKeys.length === 0) {
      state.activeStudentId = null;
      if (DOM.adminStudentSelect) {
        DOM.adminStudentSelect.innerHTML = '<option value="">-- No registered aspirants yet --</option>';
      }
      if (DOM.adminStudentAvatar) DOM.adminStudentAvatar.textContent = '👤';
      if (DOM.adminStudentDispName) DOM.adminStudentDispName.textContent = 'No Aspirant Registered';
      if (DOM.adminStudentDispBatch) DOM.adminStudentDispBatch.textContent = 'Aspirants will appear automatically once a student logs in';
      if (DOM.adminStudentStatusPill) DOM.adminStudentStatusPill.textContent = '⚪ Waiting for Student Login';

      if (DOM.adminStatOverallPct) DOM.adminStatOverallPct.textContent = '0.0%';
      if (DOM.adminStatMilestones) DOM.adminStatMilestones.textContent = '0 / 5,380 stages';
      if (DOM.adminStatLectures) DOM.adminStatLectures.textContent = '0';
      if (DOM.adminStatLecturesSub) DOM.adminStatLecturesSub.textContent = `of ${masterLectures.length.toLocaleString()} lectures`;
      if (DOM.adminStatNotesRev) DOM.adminStatNotesRev.textContent = '0 / 0';
      if (DOM.adminStatTaskRate) DOM.adminStatTaskRate.textContent = '0%';
      if (DOM.adminStatTaskDone) DOM.adminStatTaskDone.textContent = '0 done / 0 total';
      if (DOM.adminStatMocksAttempted) DOM.adminStatMocksAttempted.textContent = '0';
      if (DOM.adminStatMocksAvg) DOM.adminStatMocksAvg.textContent = 'Avg Score: -- / 200';
      if (DOM.adminStatStreak) DOM.adminStatStreak.textContent = '0 Days';
      if (DOM.adminStatScheduleHrs) DOM.adminStatScheduleHrs.textContent = '0.0h study today';

      if (DOM.adminSubjectsMatrix) {
        DOM.adminSubjectsMatrix.innerHTML = STUDY_DATA.subjects.map(sub => `
          <div class="admin-sub-item">
            <div class="admin-sub-top">
              <span title="${sub.name}">${sub.icon} ${sub.name.length > 15 ? sub.name.substring(0,14)+'…' : sub.name}</span>
              <span>0%</span>
            </div>
            <div class="admin-sub-bar">
              <div style="height:100%;width:0%;background:${sub.color};"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);margin-top:0.3rem;">
              <span>${sub.totalLectures} lecs</span>
              <span style="color:var(--text-muted);">⚪ Pending</span>
            </div>
          </div>
        `).join('');
      }

      if (DOM.adminTotalStudentsBadge) DOM.adminTotalStudentsBadge.textContent = '0 Aspirants';
      if (DOM.adminStudentsRosterBody) {
        DOM.adminStudentsRosterBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">No registered aspirants yet. When a student enters their name and logs in, they will immediately appear here with full performance tracking.</td></tr>';
      }
      if (DOM.adminAssignedTasksList) {
        DOM.adminAssignedTasksList.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No registered aspirants yet. Tasks can be assigned once an aspirant logs in.</td></tr>';
      }
      if (DOM.adminAssignedTasksCount) DOM.adminAssignedTasksCount.textContent = '0 assigned';
      if (DOM.adminRoutineList) {
        DOM.adminRoutineList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1.5rem;font-size:0.8rem;">No registered aspirants yet. Schedule will appear once an aspirant logs in.</div>';
      }
      if (DOM.adminRoutineSlotCount) DOM.adminRoutineSlotCount.textContent = '0 slots';
      return;
    }

    if (!state.activeStudentId || !students[state.activeStudentId]) {
      state.activeStudentId = studentKeys[0];
    }

    const student = students[state.activeStudentId] || students[studentKeys[0]];

    // Populate Aspirant Selector Dropdown
    if (DOM.adminStudentSelect) {
      DOM.adminStudentSelect.innerHTML = studentKeys.map(k => {
        const st = students[k];
        const isSel = k === state.activeStudentId ? 'selected' : '';
        return `<option value="${st.id}" ${isSel}>${st.name} (${st.batch ? st.batch.split('•')[0].trim() : 'Aspirant'})</option>`;
      }).join('');
    }

    // Student Header in Admin Command Center
    if (DOM.adminStudentAvatar) DOM.adminStudentAvatar.textContent = student.avatar || '🎓';
    if (DOM.adminStudentDispName) DOM.adminStudentDispName.textContent = student.name;
    if (DOM.adminStudentDispBatch) DOM.adminStudentDispBatch.textContent = student.batch || 'Mission 2026-2027 Aspirant';
    if (DOM.adminStudentStatusPill) DOM.adminStudentStatusPill.textContent = student.status || '🟢 Active';

    // Calculate metrics for selected student
    const m = calculateStudentMetrics(student);

    // Render Stats
    if (DOM.adminStatOverallPct) DOM.adminStatOverallPct.textContent = `${m.pct.toFixed(1)}%`;
    if (DOM.adminStatMilestones) DOM.adminStatMilestones.textContent = `${m.done.toLocaleString()} / ${m.totalStages.toLocaleString()} stages`;
    if (DOM.adminStatLectures) DOM.adminStatLectures.textContent = m.totalW.toLocaleString();
    if (DOM.adminStatLecturesSub) DOM.adminStatLecturesSub.textContent = `of ${masterLectures.length.toLocaleString()} lectures`;
    if (DOM.adminStatNotesRev) DOM.adminStatNotesRev.textContent = `${m.totalN} / ${m.totalR}`;
    if (DOM.adminStatTaskRate) DOM.adminStatTaskRate.textContent = `${m.taskRate}%`;
    if (DOM.adminStatTaskDone) DOM.adminStatTaskDone.textContent = `${m.taskDone} done / ${m.taskTotal} total`;
    if (DOM.adminStatMocksAttempted) DOM.adminStatMocksAttempted.textContent = m.mocksCount;
    if (DOM.adminStatMocksAvg) DOM.adminStatMocksAvg.textContent = `Avg Score: ${m.avgScore} / 200`;
    if (DOM.adminStatStreak) DOM.adminStatStreak.textContent = `${m.streak} Days`;
    if (DOM.adminStatScheduleHrs) DOM.adminStatScheduleHrs.textContent = `${m.studyHrs.toFixed(1)}h study today`;

    // Mentor feedback input
    if (DOM.adminMentorFeedbackInput) {
      DOM.adminMentorFeedbackInput.value = student.mentorFeedback || '';
    }

    // Render Subjects Matrix
    renderAdminSubjectsMatrix();

    // Render Registered Aspirants Directory & Performance Roster
    renderAdminStudentsRoster();

    // Render Admin Assigned Tasks Ledger
    renderAdminAssignedTasksLedger();

    // Render Admin Routine Preview
    renderAdminRoutinePreview();
  }

  function renderAdminSubjectsMatrix() {
    if (!DOM.adminSubjectsMatrix) return;
    const students = getRegisteredStudents();
    const student = students[state.activeStudentId] || Object.values(students)[0];
    const lecs = (student && student.lectures) || {};

    DOM.adminSubjectsMatrix.innerHTML = STUDY_DATA.subjects.map(sub => {
      const subLecs = masterLectures.filter(l => l.subjectId === sub.id);
      const totalSubStages = subLecs.length * 4;
      let doneSubStages = 0;
      subLecs.forEach(l => {
        const st = lecs[l.sNo];
        if (st) {
          if (st.watched) doneSubStages++;
          if (st.notes) doneSubStages++;
          if (st.revision) doneSubStages++;
          if (st.question) doneSubStages++;
        }
      });

      const p = totalSubStages > 0 ? (doneSubStages / totalSubStages) * 100 : 0;

      let statusTag = '';
      if (p >= 75) statusTag = '<span style="color:var(--accent-emerald);">🟢 Strong</span>';
      else if (p >= 35) statusTag = '<span style="color:var(--accent-yellow);">⚡ Active</span>';
      else statusTag = '<span style="color:var(--accent-red);">⚠️ Needs Work</span>';

      return `
      <div class="admin-sub-item">
        <div class="admin-sub-top">
          <span title="${sub.name}">${sub.icon} ${sub.name.length > 15 ? sub.name.substring(0,14)+'…' : sub.name}</span>
          <span>${p.toFixed(0)}%</span>
        </div>
        <div class="admin-sub-bar">
          <div style="height:100%;width:${p}%;background:${sub.color};"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);margin-top:0.3rem;">
          <span>${sub.totalLectures} lecs</span>
          ${statusTag}
        </div>
      </div>`;
    }).join('');
  }

  function renderAdminStudentsRoster() {
    if (!DOM.adminStudentsRosterBody) return;
    const students = getRegisteredStudents();
    const studentList = Object.values(students);

    if (DOM.adminTotalStudentsBadge) {
      DOM.adminTotalStudentsBadge.textContent = `${studentList.length} Aspirant${studentList.length === 1 ? '' : 's'}`;
    }

    if (studentList.length === 0) {
      DOM.adminStudentsRosterBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No registered students found.</td></tr>`;
      return;
    }

    DOM.adminStudentsRosterBody.innerHTML = studentList.map(st => {
      const m = calculateStudentMetrics(st);
      const isSelected = st.id === state.activeStudentId;
      const highlightRow = isSelected ? 'style="background:rgba(168,85,247,0.08);font-weight:600;"' : '';

      return `
      <tr ${highlightRow}>
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="font-size:1.3rem;">${st.avatar || '🎓'}</span>
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${st.name}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);">${st.batch ? st.batch.split('•')[0].trim() : 'Mission 2027'}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <div style="flex:1;min-width:60px;height:7px;background:var(--border-color);border-radius:4px;overflow:hidden;">
              <div style="width:${m.pct.toFixed(0)}%;height:100%;background:linear-gradient(90deg, #6366f1, #a855f7);border-radius:4px;"></div>
            </div>
            <span style="font-size:0.8rem;font-weight:600;">${m.pct.toFixed(1)}%</span>
          </div>
        </td>
        <td>
          <span style="font-size:0.82rem;font-weight:600;">${m.totalW.toLocaleString()}</span>
          <span style="font-size:0.7rem;color:var(--text-muted);">/ ${masterLectures.length.toLocaleString()}</span>
        </td>
        <td>
          <span class="badge ${m.taskRate >= 70 ? 'badge-completed' : 'badge-pending'}" style="font-size:0.72rem;padding:0.15rem 0.45rem;">
            ${m.taskRate}% (${m.taskDone}/${m.taskTotal})
          </span>
        </td>
        <td>
          <span style="font-size:0.82rem;font-weight:600;">🔥 ${m.streak}d</span>
        </td>
        <td>
          <span style="font-size:0.75rem;color:var(--text-muted);">${st.lastActiveDate || 'Recently'}</span>
        </td>
        <td>
          <button class="btn btn-xs ${isSelected ? 'btn-admin' : 'btn-secondary'} inspect-student-btn" data-student-id="${st.id}">
            ${isSelected ? '✓ Active' : 'Inspect 👁️'}
          </button>
        </td>
      </tr>
      `;
    }).join('');

    DOM.adminStudentsRosterBody.querySelectorAll('.inspect-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sId = btn.getAttribute('data-student-id');
        if (sId) {
          state.activeStudentId = sId;
          if (DOM.adminStudentSelect) DOM.adminStudentSelect.value = sId;
          renderAdminView();
          const s = getRegisteredStudents()[sId];
          showToast(`Now inspecting: ${s ? s.name : sId} 👑`);
        }
      });
    });
  }

  // 2. ADMIN DIRECT LECTURE TASK ASSIGNMENT
  function updateAdminLectureDropdown() {
    if (!DOM.adminLectureSelect || !DOM.adminLectureSubjectSelect) return;
    const subId = DOM.adminLectureSubjectSelect.value;
    const q = (DOM.adminLectureSearchInput ? DOM.adminLectureSearchInput.value : '').toLowerCase().trim();

    const lecs = masterLectures.filter(r => {
      if (subId && r.subjectId !== subId) return false;
      if (q && !(`${r.sNo} ${r.title} ${r.subtopic}`).toLowerCase().includes(q)) return false;
      return true;
    });

    if (lecs.length === 0) {
      DOM.adminLectureSelect.innerHTML = '<option value="">No lectures match filter</option>';
      return;
    }

    DOM.adminLectureSelect.innerHTML = lecs.map(l =>
      `<option value="${l.sNo}">[#${l.sNo}] ${l.title}</option>`
    ).join('');
  }

  function renderAdminAssignedTasksLedger() {
    if (!DOM.adminAssignedTasksList) return;
    const students = getRegisteredStudents();
    const student = students[state.activeStudentId] || students[Object.keys(students)[0]];
    const targets = (student && student.dailyTargets) || {};

    const allAssigned = [];
    Object.entries(targets).forEach(([d, list]) => {
      if (Array.isArray(list)) {
        list.forEach(t => {
          if (t.assignedByAdmin) {
            allAssigned.push({ ...t, targetDate: d });
          }
        });
      }
    });

    allAssigned.sort((a,b) => (b.targetDate || '').localeCompare(a.targetDate || ''));

    if (DOM.adminAssignedTasksCount) {
      DOM.adminAssignedTasksCount.textContent = `${allAssigned.length} assigned (${student ? student.name : 'student'})`;
    }

    if (allAssigned.length === 0) {
      DOM.adminAssignedTasksList.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No tasks assigned to ${student ? student.name : 'this student'} yet. Select a lecture or add a custom task above.</td></tr>`;
      return;
    }

    DOM.adminAssignedTasksList.innerHTML = allAssigned.map(t => {
      const isDone = !!t.completed;
      const isCustom = !!t.isCustomTask;
      const sub = t.subjectId ? subjectMap[t.subjectId] : null;
      const priColor = t.priority === 'urgent' ? 'var(--accent-red)' : t.priority === 'high' ? 'var(--accent-yellow)' : 'var(--text-muted)';
      const subInfo = sub ? `${sub.icon} ${sub.name} • ` : '';
      const taskMeta = isCustom ? `Custom Task (${t.hours || '1.5 hrs'})` : `#Lec ${t.sNo || '--'}`;

      return `
      <tr>
        <td style="white-space:nowrap;font-family:var(--font-mono);font-size:0.75rem;">${t.targetDate || ''}</td>
        <td>
          <div style="font-weight:700;">${isCustom ? '<span style="color:#f472b6;">⚡ </span>' : ''}${esc(t.title)}</div>
          ${t.adminNote ? `<div style="font-size:0.7rem;color:#c084fc;">Directive: ${esc(t.adminNote)}</div>` : ''}
          <div style="font-size:0.68rem;color:var(--text-muted);">${subInfo}${taskMeta}</div>
        </td>
        <td><span class="admin-tag-pill" style="border:1px solid ${priColor};color:${priColor};">${t.priority}</span></td>
        <td>
          <span class="admin-tag-pill" style="background:${isDone?'rgba(16,185,129,0.15)':'rgba(227,179,65,0.15)'};color:${isDone?'var(--accent-emerald)':'var(--accent-yellow)'};">
            ${isDone ? '✅ Completed' : '⏳ Pending'}
          </span>
        </td>
        <td>
          <button class="btn btn-danger btn-xs admin-del-task-btn" data-tid="${t.id}" data-date="${t.targetDate}" title="Revoke task">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    DOM.adminAssignedTasksList.querySelectorAll('.admin-del-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteAdminAssignedTask(btn.dataset.tid, btn.dataset.date);
      });
    });
  }

  function setAdminTaskMode(mode) {
    state.adminTaskAssignMode = mode;
    if (DOM.btnAdminModeLecture) DOM.btnAdminModeLecture.classList.toggle('active', mode === 'lecture');
    if (DOM.btnAdminModeCustom) DOM.btnAdminModeCustom.classList.toggle('active', mode === 'custom');
    if (DOM.adminLectureAssignForm) DOM.adminLectureAssignForm.style.display = mode === 'lecture' ? '' : 'none';
    if (DOM.adminCustomAssignForm) DOM.adminCustomAssignForm.style.display = mode === 'custom' ? '' : 'none';
  }

  function assignTaskToActiveStudent(task, date) {
    const students = getRegisteredStudents();
    const sId = state.activeStudentId || Object.keys(students)[0];
    const st = students[sId];
    if (!st) { showToast('No active aspirant selected'); return; }

    if (!st.dailyTargets) st.dailyTargets = {};
    if (!st.dailyTargets[date]) st.dailyTargets[date] = [];

    if (task.sNo && st.dailyTargets[date].some(x => x.sNo === task.sNo)) {
      showToast(`Lecture #${task.sNo} is already assigned to ${st.name} for ${formatDate(date)}!`);
      return;
    }

    const newTask = {
      id: uid(),
      date: date,
      completed: false,
      ...task
    };

    st.dailyTargets[date].push(newTask);
    saveRegisteredStudents(students);

    if (state.currentUser && state.currentUser.id === sId) {
      if (!state.dailyTargets[date]) state.dailyTargets[date] = [];
      state.dailyTargets[date].push(newTask);
      saveState();
      renderDailyTargets();
    }

    renderAdminView();
    showToast(`Task assigned to ${st.name} for ${formatDate(date)} 👑`);
  }

  function deleteAdminAssignedTask(tid, targetDate) {
    const students = getRegisteredStudents();
    const sId = state.activeStudentId || Object.keys(students)[0];
    const st = students[sId];
    if (st && st.dailyTargets && st.dailyTargets[targetDate]) {
      st.dailyTargets[targetDate] = st.dailyTargets[targetDate].filter(x => x.id !== tid);
      saveRegisteredStudents(students);
    }
    if (state.currentUser && state.currentUser.id === sId) {
      if (state.dailyTargets[targetDate]) {
        state.dailyTargets[targetDate] = state.dailyTargets[targetDate].filter(x => x.id !== tid);
        saveState();
        renderDailyTargets();
      }
    }
    renderAdminView();
    showToast('Assigned task revoked 🗑️');
  }

  function handleAdminAssignLecture(e) {
    e.preventDefault();
    const date = DOM.adminTaskDate ? (DOM.adminTaskDate.value || todayStr()) : todayStr();
    const sNo = parseInt(DOM.adminLectureSelect.value, 10);
    if (!sNo) { showToast('Please select a valid lecture'); return; }

    const row = masterLectures.find(r => r.sNo === sNo);
    if (!row) return;

    const task = {
      sNo: row.sNo,
      title: row.title,
      type: 'study',
      category: 'study',
      subjectId: row.subjectId,
      hours: '1.5 hrs',
      priority: (DOM.adminLecturePriority ? DOM.adminLecturePriority.value : 'high'),
      adminNote: DOM.adminLectureNote ? DOM.adminLectureNote.value.trim() : '',
      assignedByAdmin: true,
      isCustomTask: false
    };

    assignTaskToActiveStudent(task, date);
    if (DOM.adminLectureNote) DOM.adminLectureNote.value = '';
  }

  function handleAdminAssignCustomTask(e) {
    e.preventDefault();
    const date = DOM.adminCustomTaskDate ? (DOM.adminCustomTaskDate.value || todayStr()) : todayStr();
    const title = DOM.adminCustomTaskTitle ? DOM.adminCustomTaskTitle.value.trim() : '';
    if (!title) { showToast('Please enter a custom task title'); return; }

    const task = {
      title: title,
      type: 'custom',
      category: 'work',
      subjectId: DOM.adminCustomTaskSubject ? DOM.adminCustomTaskSubject.value : '',
      hours: DOM.adminCustomTaskHours ? (DOM.adminCustomTaskHours.value.trim() || '1.5 hrs') : '1.5 hrs',
      priority: DOM.adminCustomTaskPriority ? DOM.adminCustomTaskPriority.value : 'high',
      adminNote: DOM.adminCustomTaskNote ? DOM.adminCustomTaskNote.value.trim() : '',
      assignedByAdmin: true,
      isCustomTask: true
    };

    assignTaskToActiveStudent(task, date);
    if (DOM.adminCustomTaskTitle) DOM.adminCustomTaskTitle.value = '';
    if (DOM.adminCustomTaskNote) DOM.adminCustomTaskNote.value = '';
  }

  // 3. ADMIN DAILY ROUTINE & TIMETABLE BUILDER
  const ROUTINE_PRESETS = {
    intensive: [
      { time: '06:00 - 08:00', startMin: 360, endMin: 480, label: 'Vocabulary & Idioms Morning Drill', category: 'study', icon: '📚', assignedSubject: 'vocab', desc: 'Revise 50 OWS + 30 Idioms with flashcards', assignedByAdmin: true, completed: false },
      { time: '08:30 - 11:30', startMin: 510, endMin: 690, label: 'Quantitative Math Problem Solving', category: 'study', icon: '➗', assignedSubject: 'arithmetic', desc: 'Solve 60 Chapter-wise questions + Error Notebook', assignedByAdmin: true, completed: false },
      { time: '11:45 - 13:15', startMin: 705, endMin: 795, label: 'Reasoning & Logical Aptitude Section', category: 'study', icon: '🧩', assignedSubject: 'reasoning', desc: 'Solve 2 full reasoning sets under timer', assignedByAdmin: true, completed: false },
      { time: '13:15 - 14:15', startMin: 795, endMin: 855, label: 'Healthy Lunch & Power Nap', category: 'rest', icon: '🥗', assignedSubject: '', desc: 'Recharge focus for afternoon session', assignedByAdmin: true, completed: false },
      { time: '14:30 - 17:30', startMin: 870, endMin: 1050, label: 'General Studies Core (Polity & History)', category: 'study', icon: '🏛️', assignedSubject: 'history', desc: 'Revise NCERT summaries and previous year questions', assignedByAdmin: true, completed: false },
      { time: '18:00 - 19:30', startMin: 1080, endMin: 1170, label: 'Full Length Exam Tier-1 Mock Test', category: 'study', icon: '📝', assignedSubject: '', desc: 'Simulated real exam environment practice', assignedByAdmin: true, completed: false },
      { time: '19:45 - 21:00', startMin: 1185, endMin: 1260, label: 'Mock In-Depth Error Analysis', category: 'study', icon: '🔍', assignedSubject: '', desc: 'Note down all incorrect and unattempted questions', assignedByAdmin: true, completed: false },
      { time: '21:00 - 22:00', startMin: 1260, endMin: 1320, label: 'Dinner & Physical Walk', category: 'rest', icon: '🚶', assignedSubject: '', desc: 'Mental relaxation before night sleep', assignedByAdmin: true, completed: false }
    ],
    balanced: [
      { time: '06:30 - 08:30', startMin: 390, endMin: 510, label: 'Early Morning English Grammar & Vocab', category: 'study', icon: '✍️', assignedSubject: 'grammar', desc: 'Target 1 grammar topic rule + 25 vocab words', assignedByAdmin: true, completed: false },
      { time: '09:00 - 13:00', startMin: 540, endMin: 780, label: 'Job / Professional Work Shift (Morning)', category: 'work', icon: '💼', assignedSubject: '', desc: 'Professional responsibilities', assignedByAdmin: true, completed: false },
      { time: '13:00 - 14:00', startMin: 780, endMin: 840, label: 'Lunch Break & Quick Current Affairs Read', category: 'rest', icon: '📰', assignedSubject: 'current_affairs', desc: 'Read monthly CA digest while resting', assignedByAdmin: true, completed: false },
      { time: '14:00 - 18:00', startMin: 840, endMin: 1080, label: 'Job / Professional Work Shift (Afternoon)', category: 'work', icon: '💼', assignedSubject: '', desc: 'Complete remaining office deliverables', assignedByAdmin: true, completed: false },
      { time: '19:00 - 21:30', startMin: 1140, endMin: 1290, label: 'Evening Deep Study: Mathematics & Reasoning', category: 'study', icon: '📐', assignedSubject: 'advanced_math', desc: 'Geometry & Mensuration concept practice', assignedByAdmin: true, completed: false },
      { time: '22:00 - 23:30', startMin: 1320, endMin: 1410, label: 'Night Revision & Rapid Fire Quiz', category: 'study', icon: '⚡', assignedSubject: 'static_gk', desc: 'Revise Static GK Folk Dances & Temples', assignedByAdmin: true, completed: false }
    ],
    weekend_mock: [
      { time: '07:30 - 09:00', startMin: 450, endMin: 540, label: 'Formula Sheet & Speed Math Drills', category: 'study', icon: '⚡', assignedSubject: 'arithmetic', desc: 'Warmup calculation speed (squares, cubes, % tables)', assignedByAdmin: true, completed: false },
      { time: '09:00 - 10:00', startMin: 540, endMin: 600, label: 'MOCK #1 — SSC CGL Tier-1 Exam Test', category: 'study', icon: '📝', assignedSubject: '', desc: 'Strict 60-minute time limit test', assignedByAdmin: true, completed: false },
      { time: '10:30 - 12:30', startMin: 630, endMin: 750, label: 'Mock #1 Comprehensive Post-Mortem', category: 'study', icon: '🔬', assignedSubject: '', desc: 'Analyze negative markings and time spent per question', assignedByAdmin: true, completed: false },
      { time: '14:00 - 16:00', startMin: 840, endMin: 960, label: 'Weak Chapter Target Practice', category: 'study', icon: '🎯', assignedSubject: 'arithmetic', desc: 'Focus specifically on questions missed in Mock #1', assignedByAdmin: true, completed: false },
      { time: '17:00 - 18:00', startMin: 1020, endMin: 1080, label: 'MOCK #2 — Sectional Speed Test', category: 'study', icon: '⏱️', assignedSubject: 'reasoning', desc: 'Reasoning + English 50 Questions sprint', assignedByAdmin: true, completed: false },
      { time: '19:00 - 21:00', startMin: 1140, endMin: 1260, label: 'Weekly Performance Review & Strategy Alignment', category: 'coaching', icon: '📈', assignedSubject: '', desc: 'Plan next week syllabus milestone targets with mentor', assignedByAdmin: true, completed: false }
    ]
  };

  function applyRoutinePreset(presetKey) {
    const d = state.selectedAdminRoutineDate || todayStr();
    const students = getRegisteredStudents();
    const sId = state.activeStudentId || Object.keys(students)[0];
    const st = students[sId];

    if (presetKey === 'clear') {
      if (st) {
        if (!st.dailyTimetables) st.dailyTimetables = {};
        st.dailyTimetables[d] = [];
        saveRegisteredStudents(students);
      }
      if (state.currentUser && state.currentUser.id === sId) {
        state.dailyTimetables[d] = [];
        saveState();
        renderTimetable();
      }
      renderAdminRoutinePreview();
      showToast(`Timetable cleared for ${formatDate(d)}`);
      return;
    }

    const template = ROUTINE_PRESETS[presetKey];
    if (!template) return;

    const cloned = template.map(slot => ({
      ...slot,
      id: uid(),
      completed: false
    }));

    if (st) {
      if (!st.dailyTimetables) st.dailyTimetables = {};
      st.dailyTimetables[d] = cloned;
      saveRegisteredStudents(students);
    }
    if (state.currentUser && state.currentUser.id === sId) {
      state.dailyTimetables[d] = cloned;
      saveState();
      renderTimetable();
    }

    renderAdminRoutinePreview();
    updateAllHeroMetrics();
    showToast(`Preset "${presetKey}" applied to ${st ? st.name : 'student'} for ${formatDate(d)} 👑`);
  }

  function handleAdminAddSlot(e) {
    e.preventDefault();
    const d = state.selectedAdminRoutineDate || todayStr();
    const startTime = DOM.adminSlotStart ? DOM.adminSlotStart.value : '09:00';
    const endTime = DOM.adminSlotEnd ? DOM.adminSlotEnd.value : '10:30';
    const label = DOM.adminSlotLabel ? DOM.adminSlotLabel.value.trim() : '';
    if (!label) { showToast('Please enter a slot title'); return; }

    const slotData = {
      id: uid(),
      time: `${startTime} - ${endTime}`,
      startMin: timeToMin(startTime),
      endMin: timeToMin(endTime),
      label: label,
      category: DOM.adminSlotCategory ? DOM.adminSlotCategory.value : 'study',
      icon: DOM.adminSlotIcon ? DOM.adminSlotIcon.value.trim() : '📖',
      assignedSubject: DOM.adminSlotSubject ? DOM.adminSlotSubject.value : '',
      desc: DOM.adminSlotDesc ? DOM.adminSlotDesc.value.trim() : '',
      assignedByAdmin: true,
      completed: false
    };

    const students = getRegisteredStudents();
    const sId = state.activeStudentId || Object.keys(students)[0];
    const st = students[sId];
    if (st) {
      if (!st.dailyTimetables) st.dailyTimetables = {};
      if (!st.dailyTimetables[d]) st.dailyTimetables[d] = [];
      st.dailyTimetables[d].push(slotData);
      st.dailyTimetables[d].sort((a,b) => (a.startMin || 0) - (b.startMin || 0));
      saveRegisteredStudents(students);
    }
    if (state.currentUser && state.currentUser.id === sId) {
      if (!state.dailyTimetables[d]) state.dailyTimetables[d] = [];
      state.dailyTimetables[d].push(slotData);
      state.dailyTimetables[d].sort((a,b) => (a.startMin || 0) - (b.startMin || 0));
      saveState();
      renderTimetable();
    }

    if (DOM.adminSlotLabel) DOM.adminSlotLabel.value = '';
    if (DOM.adminSlotDesc) DOM.adminSlotDesc.value = '';
    renderAdminRoutinePreview();
    updateAllHeroMetrics();
    showToast(`Routine slot scheduled for ${st ? st.name : 'student'} on ${formatDate(d)} 👑`);
  }

  function deleteAdminRoutineSlot(slotId, dateStr) {
    const students = getRegisteredStudents();
    const sId = state.activeStudentId || Object.keys(students)[0];
    const st = students[sId];
    if (st && st.dailyTimetables && st.dailyTimetables[dateStr]) {
      st.dailyTimetables[dateStr] = st.dailyTimetables[dateStr].filter(s => s.id !== slotId);
      saveRegisteredStudents(students);
    }
    if (state.currentUser && state.currentUser.id === sId) {
      if (state.dailyTimetables[dateStr]) {
        state.dailyTimetables[dateStr] = state.dailyTimetables[dateStr].filter(s => s.id !== slotId);
        saveState();
        renderTimetable();
      }
    }
    renderAdminRoutinePreview();
    updateAllHeroMetrics();
    showToast('Routine slot deleted');
  }

  function renderAdminRoutinePreview() {
    if (!DOM.adminRoutineList) return;
    const d = state.selectedAdminRoutineDate || todayStr();
    if (DOM.adminRoutineDateLabel) DOM.adminRoutineDateLabel.textContent = d === todayStr() ? 'Today' : formatDate(d);

    const students = getRegisteredStudents();
    const student = students[state.activeStudentId] || students[Object.keys(students)[0]];
    const timetables = (student && student.dailyTimetables) || {};
    const slots = (timetables[d] || []).slice().sort((a,b) => a.startMin - b.startMin);

    if (DOM.adminRoutineSlotCount) DOM.adminRoutineSlotCount.textContent = `${slots.length} slot${slots.length===1?'':'s'} (${student ? student.name : 'student'})`;

    if (slots.length === 0) {
      DOM.adminRoutineList.innerHTML = `<div class="empty-state-card" style="padding:1.5rem;"><div class="empty-icon">⏰</div><p>No routine scheduled for this date. Choose a preset or add a custom slot above.</p></div>`;
      return;
    }

    DOM.adminRoutineList.innerHTML = slots.map(s => {
      const sub = s.assignedSubject ? subjectMap[s.assignedSubject] : null;
      const dur = parseSlotDur(s.time);
      return `
      <div class="timeline-item ${s.assignedByAdmin ? 'is-admin-slot' : ''}" style="padding:0.6rem 0.75rem;">
        <div class="time-slot" style="min-width:70px;"><div>${s.time}</div><div style="font-size:0.65rem;">${dur}h</div></div>
        <div class="time-activity">
          <div class="time-title" style="font-size:0.82rem;">${s.icon||'⚡'} ${esc(s.label)}</div>
          ${s.desc ? `<div class="time-desc" style="font-size:0.7rem;">${esc(s.desc)}</div>` : ''}
          ${sub ? `<div class="slot-subject-badge" style="background:${sub.color}18;color:${sub.color};border:1px solid ${sub.color}44;font-size:0.65rem;">${sub.icon} ${sub.name}</div>` : ''}
        </div>
        <span class="time-tag ${s.category}" style="font-size:0.62rem;">${s.category}</span>
        <button class="btn btn-danger btn-xs admin-del-slot-btn" data-sid="${s.id}" title="Remove slot">🗑️</button>
      </div>`;
    }).join('');

    DOM.adminRoutineList.querySelectorAll('.admin-del-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteAdminRoutineSlot(btn.dataset.sid, d);
      });
    });
  }

  function saveMentorFeedbackForActiveStudent(text) {
    const students = getRegisteredStudents();
    const sId = state.activeStudentId || Object.keys(students)[0];
    const st = students[sId];
    if (st) {
      st.mentorFeedback = text;
      st.mentorNoticeDismissed = false;
      saveRegisteredStudents(students);
    }
    if (state.currentUser && state.currentUser.id === sId) {
      state.mentorFeedback = text;
      state.mentorNoticeDismissed = false;
      saveState();
      renderMentorBanner();
    }
    showToast(`Mentor feedback saved & dispatched to ${st ? st.name : 'student'}! 👑`);
  }

  /* ============================================================
     CLOCK & COUNTDOWN
  ============================================================ */
  function startClock() {
    function tick() {
      const now = new Date();
      const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      if (DOM.liveTimeClock) DOM.liveTimeClock.innerHTML = `🟢 Live Clock: ${t}`;
    }
    tick(); setInterval(tick, 1000);
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  function esc(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[c] || c);
  }

  function showToast(msg) {
    if (!DOM.toastNotification) return;
    DOM.toastNotification.textContent = msg;
    DOM.toastNotification.style.display = 'block';
    clearTimeout(DOM.toastNotification._timer);
    DOM.toastNotification._timer = setTimeout(() => { DOM.toastNotification.style.display = 'none'; }, 2500);
  }

  function celebrate(title, msg) {
    if (DOM.celebrationTitle) DOM.celebrationTitle.textContent = title;
    if (DOM.celebrationMsg) DOM.celebrationMsg.textContent = msg;
    if (DOM.celebrationModal) DOM.celebrationModal.classList.add('active');
  }

  function switchTab(tabId) {
    // If student tries to open admin portal without credentials
    if (tabId === 'tab-admin' && (!state.currentUser || state.currentUser.role !== 'admin')) {
      showToast('⚠️ Admin portal requires admin credentials (admin / arav)');
      showAuthScreen();
      return;
    }

    state.activeTab = tabId;
    DOM.navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    DOM.tabPanes.forEach(p => p.classList.toggle('active', p.id === tabId));
    if (tabId === 'tab-progress') renderSubjectCards();
    else if (tabId === 'tab-daily') renderDailyTargets();
    else if (tabId === 'tab-timetable') renderTimetable();
    else if (tabId === 'tab-todo') renderSyllabus();
    else if (tabId === 'tab-mocks') { renderMockSeriesTabs(); renderMockTable(); }
    else if (tabId === 'tab-motivation') renderTrophies();
    else if (tabId === 'tab-admin') renderAdminView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
     EVENT LISTENERS
  ============================================================ */
  function setupEvents() {
    // Auth Mode Tabs
    if (DOM.tabAuthStudent) {
      DOM.tabAuthStudent.addEventListener('click', () => {
        DOM.tabAuthStudent.classList.add('active');
        if (DOM.tabAuthAdmin) DOM.tabAuthAdmin.classList.remove('active');
        if (DOM.authStudentForm) DOM.authStudentForm.style.display = 'block';
        if (DOM.authAdminForm) DOM.authAdminForm.style.display = 'none';
        if (DOM.authError) DOM.authError.style.display = 'none';
      });
    }
    if (DOM.tabAuthAdmin) {
      DOM.tabAuthAdmin.addEventListener('click', () => {
        DOM.tabAuthAdmin.classList.add('active');
        if (DOM.tabAuthStudent) DOM.tabAuthStudent.classList.remove('active');
        if (DOM.authAdminForm) DOM.authAdminForm.style.display = 'block';
        if (DOM.authStudentForm) DOM.authStudentForm.style.display = 'none';
        if (DOM.authError) DOM.authError.style.display = 'none';
      });
    }

    // Student Login Form Submit
    if (DOM.authStudentForm) {
      DOM.authStudentForm.addEventListener('submit', e => {
        e.preventDefault();
        const n = DOM.authStudentName ? DOM.authStudentName.value : '';
        const p = DOM.authStudentPassword ? DOM.authStudentPassword.value : '';
        handleStudentLogin(n, p);
      });
    }

    // Admin Login Form Submit
    if (DOM.authAdminForm) {
      DOM.authAdminForm.addEventListener('submit', e => {
        e.preventDefault();
        const u = DOM.authAdminUsername ? DOM.authAdminUsername.value : '';
        const p = DOM.authAdminPassword ? DOM.authAdminPassword.value : '';
        handleAdminLogin(u, p);
      });
    }

    // Logout
    if (DOM.logoutBtn) DOM.logoutBtn.addEventListener('click', logout);

    // Theme
    if (DOM.themeToggleBtn) DOM.themeToggleBtn.addEventListener('click', () => applyTheme(state.theme==='dark'?'light':'dark'));

    // Role switcher
    if (DOM.roleStudentBtn) DOM.roleStudentBtn.addEventListener('click', () => setRole('student'));
    if (DOM.roleAdminBtn) DOM.roleAdminBtn.addEventListener('click', () => setRole('admin'));
    if (DOM.exitAdminModeBtn) DOM.exitAdminModeBtn.addEventListener('click', () => setRole('student'));
    if (DOM.quickAssignTaskBtn) {
      DOM.quickAssignTaskBtn.addEventListener('click', () => {
        switchTab('tab-admin');
        if (DOM.adminLectureSelect) DOM.adminLectureSelect.focus();
      });
    }
    if (DOM.quickRoutineBtn) {
      DOM.quickRoutineBtn.addEventListener('click', () => {
        switchTab('tab-admin');
        if (DOM.adminSlotLabel) DOM.adminSlotLabel.focus();
      });
    }
    if (DOM.dismissMentorNoticeBtn) {
      DOM.dismissMentorNoticeBtn.addEventListener('click', () => {
        state.mentorNoticeDismissed = true;
        saveState();
        renderMentorBanner();
      });
    }

    // Student selection in admin mode
    if (DOM.adminStudentSelect) {
      DOM.adminStudentSelect.addEventListener('change', e => {
        state.activeStudentId = e.target.value;
        renderAdminView();
        const s = getRegisteredStudents()[state.activeStudentId];
        showToast(`Viewing profile: ${s ? s.name : state.activeStudentId} 🎓`);
      });
    }
    if (DOM.adminRefreshBtn) DOM.adminRefreshBtn.addEventListener('click', () => {
      renderAdminView();
      showToast('Admin data refreshed');
    });

    // Save mentor feedback
    if (DOM.adminSaveFeedbackBtn) {
      DOM.adminSaveFeedbackBtn.addEventListener('click', () => {
        const txt = DOM.adminMentorFeedbackInput ? DOM.adminMentorFeedbackInput.value.trim() : '';
        saveMentorFeedbackForActiveStudent(txt);
      });
    }

    // Nav tabs
    DOM.navTabs.forEach(tab => tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'tab-admin') {
        if (!state.currentUser || state.currentUser.role !== 'admin') {
          showToast('⚠️ Admin portal requires admin credentials (admin / arav)');
          showAuthScreen();
          return;
        }
        state.userRole = 'admin';
        if (DOM.roleStudentBtn) DOM.roleStudentBtn.classList.remove('active');
        if (DOM.roleAdminBtn) {
          DOM.roleAdminBtn.classList.add('active');
          DOM.roleAdminBtn.classList.add('role-admin-active');
        }
        if (DOM.adminModeBanner) DOM.adminModeBanner.style.display = 'flex';
      }
      switchTab(tab.dataset.tab);
    }));

    // Subject filter
    if (DOM.subjectCategoryFilter) DOM.subjectCategoryFilter.addEventListener('change', renderSubjectCards);

    // Export
    if (DOM.exportBtn) DOM.exportBtn.addEventListener('click', () => {
      const data = {
        theme: state.theme,
        lectures: state.lectures,
        mocks: state.mocks,
        dailyTargets: state.dailyTargets,
        dailyTimetables: state.dailyTimetables,
        streak: state.streak,
        lastActiveDate: state.lastActiveDate,
        mentorFeedback: state.mentorFeedback,
        mentorNoticeDismissed: state.mentorNoticeDismissed
      };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }));
      a.download = `mission2027_backup_${todayStr()}.json`;
      a.click();
    });

    // Import
    if (DOM.importBtn) DOM.importBtn.addEventListener('click', () => DOM.importFileInput && DOM.importFileInput.click());
    if (DOM.importFileInput) DOM.importFileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const p = JSON.parse(ev.target.result);
          if (p.lectures) state.lectures = p.lectures;
          if (p.mocks) state.mocks = p.mocks;
          if (p.dailyTargets) state.dailyTargets = p.dailyTargets;
          if (p.dailyTimetables) state.dailyTimetables = p.dailyTimetables;
          if (p.mentorFeedback !== undefined) state.mentorFeedback = p.mentorFeedback;
          if (p.theme) applyTheme(p.theme);
          saveState(); refreshAll(); showToast('Import successful ✅');
        } catch { showToast('Import failed — invalid file'); }
      };
      reader.readAsText(file);
    });

    // Reset
    if (DOM.resetBtn) DOM.resetBtn.addEventListener('click', () => { if (DOM.resetConfirmModal) DOM.resetConfirmModal.classList.add('active'); });
    if (DOM.cancelResetBtn) DOM.cancelResetBtn.addEventListener('click', () => DOM.resetConfirmModal.classList.remove('active'));
    if (DOM.confirmResetBtn) DOM.confirmResetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      state.lectures = {}; state.mocks = {}; state.dailyTargets = {}; state.dailyTimetables = {};
      state.streak = 1; state.lastActiveDate = todayStr();
      state.mentorFeedback = '';
      DOM.resetConfirmModal.classList.remove('active');
      refreshAll(); showToast('All progress reset');
    });

    // Celebration modal close
    if (DOM.closeCelebrationBtn) DOM.closeCelebrationBtn.addEventListener('click', () => DOM.celebrationModal.classList.remove('active'));

    // --- DAILY TARGETS ---
    // Date navigation
    if (DOM.dailyTaskDatePicker) DOM.dailyTaskDatePicker.addEventListener('change', e => {
      state.selectedTargetDate = e.target.value || todayStr();
      renderDailyTargets();
    });
    if (DOM.dtPrevDayBtn) DOM.dtPrevDayBtn.addEventListener('click', () => {
      state.selectedTargetDate = offsetDate(state.selectedTargetDate, -1);
      renderDailyTargets();
    });
    if (DOM.dtNextDayBtn) DOM.dtNextDayBtn.addEventListener('click', () => {
      state.selectedTargetDate = offsetDate(state.selectedTargetDate, 1);
      renderDailyTargets();
    });
    if (DOM.todayDateBtn) DOM.todayDateBtn.addEventListener('click', () => {
      state.selectedTargetDate = todayStr();
      renderDailyTargets();
    });
    if (DOM.goToSyllabusBtn) DOM.goToSyllabusBtn.addEventListener('click', () => switchTab('tab-todo'));

    // Filter chips
    $$('[data-daily-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.dailyFilter = chip.dataset.dailyFilter;
        $$('[data-daily-filter]').forEach(c => c.classList.toggle('active', c === chip));
        renderDailyTargets();
      });
    });
    // Clear completed
    if (DOM.clearCompletedDailyTasksBtn) DOM.clearCompletedDailyTasksBtn.addEventListener('click', () => {
      const d = state.selectedTargetDate;
      if (state.dailyTargets[d]) state.dailyTargets[d] = state.dailyTargets[d].filter(t => !t.completed);
      saveState(); renderDailyTargets(); showToast('Completed tasks cleared');
    });

    // --- TIMETABLE ---
    if (DOM.ttDatePicker) DOM.ttDatePicker.addEventListener('change', e => {
      state.selectedTimetableDate = e.target.value || todayStr();
      renderTimetable();
    });
    if (DOM.ttPrevDayBtn) DOM.ttPrevDayBtn.addEventListener('click', () => {
      state.selectedTimetableDate = offsetDate(state.selectedTimetableDate, -1);
      renderTimetable();
    });
    if (DOM.ttNextDayBtn) DOM.ttNextDayBtn.addEventListener('click', () => {
      state.selectedTimetableDate = offsetDate(state.selectedTimetableDate, 1);
      renderTimetable();
    });
    if (DOM.ttTodayBtn) DOM.ttTodayBtn.addEventListener('click', () => {
      state.selectedTimetableDate = todayStr();
      renderTimetable();
    });
    if (DOM.openAddSlotModalBtn) DOM.openAddSlotModalBtn.addEventListener('click', () => openSlotModalFor(null));
    if (DOM.clearDateTimetableBtn) DOM.clearDateTimetableBtn.addEventListener('click', () => {
      state.dailyTimetables[state.selectedTimetableDate] = [];
      saveState(); renderTimetable(); showToast('Timetable cleared');
    });
    if (DOM.slotEditorForm) DOM.slotEditorForm.addEventListener('submit', saveSlot);
    if (DOM.closeSlotModalBtn) DOM.closeSlotModalBtn.addEventListener('click', () => DOM.slotEditorModal.classList.remove('active'));
    if (DOM.cancelSlotModalBtn) DOM.cancelSlotModalBtn.addEventListener('click', () => DOM.slotEditorModal.classList.remove('active'));
    // Click outside modal to close
    if (DOM.slotEditorModal) DOM.slotEditorModal.addEventListener('click', e => { if (e.target === DOM.slotEditorModal) DOM.slotEditorModal.classList.remove('active'); });
    if (DOM.celebrationModal) DOM.celebrationModal.addEventListener('click', e => { if (e.target === DOM.celebrationModal) DOM.celebrationModal.classList.remove('active'); });
    if (DOM.resetConfirmModal) DOM.resetConfirmModal.addEventListener('click', e => { if (e.target === DOM.resetConfirmModal) DOM.resetConfirmModal.classList.remove('active'); });

    // --- MASTER SYLLABUS ---
    if (DOM.todoSearchInput) DOM.todoSearchInput.addEventListener('input', () => {
      state.todoSearch = DOM.todoSearchInput.value;
      state.currentPage = 1;
      renderSyllabus();
    });
    if (DOM.todoSubjectFilter) DOM.todoSubjectFilter.addEventListener('change', () => {
      state.todoSubject = DOM.todoSubjectFilter.value;
      state.currentPage = 1;
      renderSyllabus();
    });
    $$('[data-todo-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.todoFilter = chip.dataset.todoFilter;
        state.currentPage = 1;
        $$('[data-todo-filter]').forEach(c => c.classList.toggle('active', c === chip));
        renderSyllabus();
      });
    });
    if (DOM.prevPageBtn) DOM.prevPageBtn.addEventListener('click', () => { state.currentPage--; renderSyllabus(); });
    if (DOM.nextPageBtn) DOM.nextPageBtn.addEventListener('click', () => { state.currentPage++; renderSyllabus(); });
    if (DOM.markAllVisibleDoneBtn) DOM.markAllVisibleDoneBtn.addEventListener('click', () => {
      getFilteredLectures().forEach(row => {
        if (!state.lectures[row.sNo]) state.lectures[row.sNo] = { watched:false, notes:false, revision:false, question:false };
        state.lectures[row.sNo] = { watched:true, notes:true, revision:true, question:true };
      });
      saveState(); updateAllHeroMetrics(); renderSubjectCards(); renderSyllabus(); showToast('All visible lectures marked done ✅');
    });
    if (DOM.resetAllVisibleBtn) DOM.resetAllVisibleBtn.addEventListener('click', () => {
      getFilteredLectures().forEach(row => { delete state.lectures[row.sNo]; });
      saveState(); updateAllHeroMetrics(); renderSubjectCards(); renderSyllabus(); showToast('Visible lectures reset');
    });

    // --- MOCK TESTS ---
    if (DOM.mockSearchInput) DOM.mockSearchInput.addEventListener('input', renderMockTable);

    // --- ADMIN COMPONENT EVENTS ---
    // Lecture selector change & keyword search
    if (DOM.adminLectureSubjectSelect) {
      DOM.adminLectureSubjectSelect.addEventListener('change', updateAdminLectureDropdown);
    }
    if (DOM.adminLectureSearchInput) {
      DOM.adminLectureSearchInput.addEventListener('input', updateAdminLectureDropdown);
    }

    // Admin Task assignment mode switch
    if (DOM.btnAdminModeLecture) DOM.btnAdminModeLecture.addEventListener('click', () => setAdminTaskMode('lecture'));
    if (DOM.btnAdminModeCustom) DOM.btnAdminModeCustom.addEventListener('click', () => setAdminTaskMode('custom'));

    if (DOM.adminLectureAssignForm) {
      DOM.adminLectureAssignForm.addEventListener('submit', handleAdminAssignLecture);
    }
    if (DOM.adminTaskTodayBtn) {
      DOM.adminTaskTodayBtn.addEventListener('click', () => {
        if (DOM.adminTaskDate) DOM.adminTaskDate.value = todayStr();
      });
    }

    // Custom task assign form
    if (DOM.adminCustomAssignForm) {
      DOM.adminCustomAssignForm.addEventListener('submit', handleAdminAssignCustomTask);
    }
    if (DOM.adminCustomTaskTodayBtn) {
      DOM.adminCustomTaskTodayBtn.addEventListener('click', () => {
        if (DOM.adminCustomTaskDate) DOM.adminCustomTaskDate.value = todayStr();
      });
    }

    // Routine Form
    if (DOM.adminSlotForm) DOM.adminSlotForm.addEventListener('submit', handleAdminAddSlot);
    if (DOM.adminRoutineDate) {
      DOM.adminRoutineDate.addEventListener('change', e => {
        state.selectedAdminRoutineDate = e.target.value || todayStr();
        renderAdminRoutinePreview();
      });
    }
    if (DOM.adminRoutineTodayBtn) {
      DOM.adminRoutineTodayBtn.addEventListener('click', () => {
        state.selectedAdminRoutineDate = todayStr();
        if (DOM.adminRoutineDate) DOM.adminRoutineDate.value = state.selectedAdminRoutineDate;
        renderAdminRoutinePreview();
      });
    }

    // Routine presets
    $$('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        applyRoutinePreset(btn.dataset.preset);
      });
    });
  }

  /* ============================================================
     REFRESH ALL VIEWS
  ============================================================ */
  function refreshAll() {
    updateAllHeroMetrics();
    renderSubjectCards();
    renderDailyTargets();
    renderTimetable();
    renderSyllabus();
    renderMockSeriesTabs();
    renderMockTable();
    renderTrophies();
    renderAdminView();
    renderMentorBanner();
  }

  /* ============================================================
     INIT
  ============================================================ */
  function init() {
    loadState();
    applyTheme(state.theme);
    if (DOM.dailyTaskDatePicker) DOM.dailyTaskDatePicker.value = state.selectedTargetDate;
    if (DOM.ttDatePicker) DOM.ttDatePicker.value = state.selectedTimetableDate;
    if (DOM.adminTaskDate) DOM.adminTaskDate.value = todayStr();
    if (DOM.adminCustomTaskDate) DOM.adminCustomTaskDate.value = todayStr();
    if (DOM.adminRoutineDate) DOM.adminRoutineDate.value = state.selectedAdminRoutineDate;
    populateSubjectDropdowns();
    updateCountdown();
    setInterval(updateCountdown, 60000);
    startClock();
    setupEvents();
    initAuth();
  }

  init();

})();
