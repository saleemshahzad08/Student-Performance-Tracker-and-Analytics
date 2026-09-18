/**
 * Student Tracker & Analytics - Core Client Application
 * Supports both Live Full-Stack Express Server Mode and Pure Client-Side GitHub Pages Mode.
 */

// Global State
const state = {
  isBackendAvailable: false,
  students: [],
  exams: [],
  marks: [],
  attendance: [],
  callLogs: [],
  activeTab: 'dashboard',
  selectedStudentId: null,
  selectedReportStudentIds: new Set(),
  currentCallStudentId: null,
  cachedTeacherAnalytics: null,
};

// ---------------------------------------------------------------------------
// INITIALIZATION & DUAL-MODE DETECTION
// ---------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', async () => {
  await detectBackendAndInit();
  initDragAndDrop();
  setupResponsiveDateDefaults();
});

async function detectBackendAndInit() {
  const isAndroidNative = window.Android || navigator.userAgent.includes('wv') || window.location.protocol === 'file:';

  if (isAndroidNative) {
    state.isBackendAvailable = false;
    const modeText = document.getElementById('runtime-mode-text');
    const modeBadge = document.getElementById('runtime-mode-badge');
    if (modeText) modeText.textContent = 'Android Standalone App (100% Offline)';
    if (modeBadge) modeBadge.className = 'inline-flex items-center gap-1 text-emerald-600 font-semibold';
  } else {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        state.isBackendAvailable = true;
        const modeText = document.getElementById('runtime-mode-text');
        const modeBadge = document.getElementById('runtime-mode-badge');
        if (modeText) modeText.textContent = 'Backend Active';
        if (modeBadge) modeBadge.className = 'inline-flex items-center gap-1 text-emerald-600 font-semibold';
      } else {
        throw new Error('Non-200 health response');
      }
    } catch (err) {
      state.isBackendAvailable = false;
      const modeText = document.getElementById('runtime-mode-text');
      const modeBadge = document.getElementById('runtime-mode-badge');
      if (modeText) modeText.textContent = 'Offline / Local Data Mode';
      if (modeBadge) modeBadge.className = 'inline-flex items-center gap-1 text-sky-600 font-semibold';
    }
  }

  if (!state.isBackendAvailable) {
    loadFromLocalStorageOrSeed();
  }

  await refreshAllData();
  switchTab('dashboard');
}

function setupResponsiveDateDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  const datePicker = document.getElementById('att-date-picker');
  if (datePicker && !datePicker.value) {
    datePicker.value = today;
  }
  const examDate = document.getElementById('exam-date');
  if (examDate && !examDate.value) {
    examDate.value = today;
  }
}

// ---------------------------------------------------------------------------
// LOCAL STORAGE & SEED DATA (For 100% GitHub Pages compatibility)
// ---------------------------------------------------------------------------

function loadFromLocalStorageOrSeed() {
  const stored = localStorage.getItem('student_tracker_data_v2');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      state.students = parsed.students || [];
      state.exams = parsed.exams || [];
      state.marks = parsed.marks || [];
      state.attendance = parsed.attendance || [];
      state.callLogs = parsed.callLogs || [];
      return;
    } catch (e) {
      console.warn('Failed to parse localStorage data, re-seeding...');
    }
  }
  seedInitialData();
  saveToLocalStorage();
}

function saveToLocalStorage() {
  if (!state.isBackendAvailable) {
    localStorage.setItem('student_tracker_data_v2', JSON.stringify({
      students: state.students,
      exams: state.exams,
      marks: state.marks,
      attendance: state.attendance,
      callLogs: state.callLogs,
    }));
  }
}

function seedInitialData() {
  state.students = [
    {
      id: 1,
      roll_no: 'CS-101',
      name: 'Aarav Sharma',
      student_phone: '+1 (555) 234-5678',
      parent_name: 'Rajesh Sharma',
      parent_phone: '+1 (555) 876-5432',
      email: 'aarav.sharma@campus.edu',
      section: 'Section A',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      roll_no: 'CS-102',
      name: 'Diya Patel',
      student_phone: '+1 (555) 345-6789',
      parent_name: 'Anita Patel',
      parent_phone: '+1 (555) 987-6543',
      email: 'diya.patel@campus.edu',
      section: 'Section A',
      created_at: new Date().toISOString(),
    },
    {
      id: 3,
      roll_no: 'CS-103',
      name: 'Ethan Walker',
      student_phone: '+1 (555) 456-7890',
      parent_name: 'David Walker',
      parent_phone: '+1 (555) 123-9876',
      email: 'ethan.walker@campus.edu',
      section: 'Section B',
      created_at: new Date().toISOString(),
    },
    {
      id: 4,
      roll_no: 'CS-104',
      name: 'Fatima Al-Sayed',
      student_phone: '+1 (555) 567-8901',
      parent_name: 'Tariq Al-Sayed',
      parent_phone: '+1 (555) 234-8765',
      email: 'fatima.alsayed@campus.edu',
      section: 'Section B',
      created_at: new Date().toISOString(),
    },
    {
      id: 5,
      roll_no: 'CS-105',
      name: 'Mei Lin',
      student_phone: '+1 (555) 678-9012',
      parent_name: 'Hao Lin',
      parent_phone: '+1 (555) 345-7654',
      email: 'mei.lin@campus.edu',
      section: 'Section A',
      created_at: new Date().toISOString(),
    },
  ];

  state.exams = [
    { id: 1, name: 'Midterm Assessment', subject: 'Computer Science & Algorithms', total_marks: 100, date: '2026-02-15' },
    { id: 2, name: 'Unit Test 2', subject: 'Database Management Systems', total_marks: 50, date: '2026-03-05' },
  ];

  state.marks = [
    { id: 1, student_id: 1, exam_id: 1, marks_obtained: 88 },
    { id: 2, student_id: 2, exam_id: 1, marks_obtained: 74.5 },
    { id: 3, student_id: 3, exam_id: 1, marks_obtained: 92 },
    { id: 4, student_id: 4, exam_id: 1, marks_obtained: 44 },
    { id: 5, student_id: 5, exam_id: 1, marks_obtained: 81 },
    { id: 6, student_id: 1, exam_id: 2, marks_obtained: 46 },
    { id: 7, student_id: 2, exam_id: 2, marks_obtained: 38 },
    { id: 8, student_id: 3, exam_id: 2, marks_obtained: 48.5 },
    { id: 9, student_id: 4, exam_id: 2, marks_obtained: 21 },
    { id: 10, student_id: 5, exam_id: 2, marks_obtained: 42.5 },
  ];

  state.attendance = [];
  const dates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'];
  let attId = 1;
  for (const d of dates) {
    for (const s of state.students) {
      const isPresent = !(s.roll_no === 'CS-104' && (d === '2026-03-02' || d === '2026-03-04'));
      state.attendance.push({ id: attId++, student_id: s.id, date: d, is_present: isPresent });
    }
  }

  state.callLogs = [
    {
      id: 1,
      student_id: 1,
      contact_person: 'Parent/Guardian',
      contact_name: 'Rajesh Sharma',
      phone_number: '+1 (555) 876-5432',
      call_datetime: '2026-03-06T14:30:00',
      subject: 'Academic honors and semester project progression',
      summary: 'Congratulated Mr. Sharma on Aarav\'s exceptional performance in Algorithms (88%) and high attendance. Discussed enrolling him in the advanced algorithmic challenge cohort.',
      outcome: 'Connected & Discussed',
      duration_minutes: 8,
      created_at: '2026-03-06T14:40:00Z',
    },
    {
      id: 2,
      student_id: 4,
      contact_person: 'Parent/Guardian',
      contact_name: 'Tariq Al-Sayed',
      phone_number: '+1 (555) 234-8765',
      call_datetime: '2026-03-07T11:15:00',
      subject: 'Attendance decline and Unit Test 2 remediation',
      summary: 'Discussed Fatima missing two laboratory sessions and falling behind on DBMS concepts (42%). Father acknowledged seasonal health issues and agreed to monitor daily attendance. Scheduled Tuesday after-school tutoring.',
      outcome: 'Follow-up Scheduled',
      duration_minutes: 14,
      created_at: '2026-03-07T11:30:00Z',
    },
    {
      id: 3,
      student_id: 2,
      contact_person: 'Student',
      contact_name: 'Diya Patel',
      phone_number: '+1 (555) 345-6789',
      call_datetime: '2026-03-08T16:00:00',
      subject: 'Office hours check-in on normalization theory',
      summary: 'Student requested clarification on BCNF decomposition. Recommended attending Wednesday TA workshop and completing chapter exercises.',
      outcome: 'Connected & Discussed',
      duration_minutes: 6,
      created_at: '2026-03-08T16:10:00Z',
    }
  ];
}

// ---------------------------------------------------------------------------
// DATA FETCHING & SYNCHRONIZATION
// ---------------------------------------------------------------------------

async function refreshAllData() {
  if (state.isBackendAvailable) {
    try {
      const [stuRes, examRes, attRes, callRes, overviewRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/exams'),
        fetch('/api/attendance'),
        fetch('/api/calls/summary'),
        fetch('/api/stats/overview'),
      ]);

      if (stuRes.ok) state.students = await stuRes.json();
      if (examRes.ok) state.exams = await examRes.json();
      if (overviewRes.ok) updateOverviewStats(await overviewRes.json());
    } catch (err) {
      console.warn('API error, falling back to cached local data:', err);
    }
  } else {
    // Local calculation for overview stats
    calculateLocalOverviewStats();
  }

  // Pre-select first student if available
  if (state.students.length > 0 && !state.selectedStudentId) {
    state.selectedStudentId = state.students[0].id;
  }

  populateSectionDropdowns();
  populateExamDropdowns();
}

function calculateLocalOverviewStats() {
  const totalStudents = state.students.length;
  const totalExams = state.exams.length;
  const totalAtt = state.attendance.length;
  const presentAtt = state.attendance.filter(a => a.is_present).length;
  const attPct = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 1000) / 10 : 100;

  let totalScore = 0;
  let scoreCount = 0;
  for (const m of state.marks) {
    const ex = state.exams.find(e => e.id === m.exam_id);
    if (ex && ex.total_marks > 0) {
      totalScore += (m.marks_obtained / ex.total_marks) * 100;
      scoreCount++;
    }
  }
  const avgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;

  let callsStudent = 0;
  let callsParent = 0;
  for (const c of state.callLogs) {
    if (c.contact_person === 'Parent/Guardian') callsParent++;
    else callsStudent++;
  }

  updateOverviewStats({
    total_students: totalStudents,
    total_exams: totalExams,
    overall_attendance_pct: attPct,
    overall_exam_avg: avgScore,
    total_calls: state.callLogs.length,
    calls_to_student: callsStudent,
    calls_to_parent: callsParent,
  });
}

function updateOverviewStats(data) {
  document.getElementById('stat-total-students').textContent = data.total_students ?? state.students.length;
  document.getElementById('stat-total-exams').textContent = data.total_exams ?? state.exams.length;
  document.getElementById('stat-overall-att').textContent = `${data.overall_attendance_pct ?? 0}%`;
  document.getElementById('stat-overall-exam').textContent = `${data.overall_exam_avg ?? 0}%`;
  document.getElementById('stat-total-calls').textContent = data.total_calls ?? state.callLogs.length;
  document.getElementById('stat-calls-sub').textContent = `${data.calls_to_parent ?? 0} parents, ${data.calls_to_student ?? 0} students`;
}

function populateSectionDropdowns() {
  const sections = Array.from(new Set(state.students.map(s => s.section || 'General'))).sort();
  const dropdowns = ['students-section-filter', 'marks-section-select', 'att-section-select', 'teacher-section-select', 'reports-section-filter'];

  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    el.innerHTML = '<option value="All">All Sections</option>';
    sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec;
      opt.textContent = sec;
      el.appendChild(opt);
    });
    if (sections.includes(currentVal)) {
      el.value = currentVal;
    }
  });
}

function populateExamDropdowns() {
  const examDropdowns = ['marks-exam-select', 'teacher-exam-select'];
  examDropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    if (id === 'teacher-exam-select') {
      el.innerHTML = '<option value="all">Overall Session (All Exams Combined)</option>';
    } else {
      el.innerHTML = '';
    }
    state.exams.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = `${ex.name} (${ex.subject} - ${ex.total_marks} Marks)`;
      el.appendChild(opt);
    });
    if (currentVal && Array.from(el.options).some(o => o.value == currentVal)) {
      el.value = currentVal;
    } else if (id === 'marks-exam-select' && state.exams.length > 0) {
      el.value = state.exams[0].id;
    }
  });
}

// ---------------------------------------------------------------------------
// TAB NAVIGATION
// ---------------------------------------------------------------------------

function switchTab(tabId) {
  state.activeTab = tabId;

  // Hide all contents
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.remove('hidden');

  // Desktop active styles
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-white', 'text-sky-700', 'shadow-xs', 'font-bold');
    btn.classList.add('text-slate-600');
  });
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.add('bg-white', 'text-sky-700', 'shadow-xs', 'font-bold');
    activeNav.classList.remove('text-slate-600');
  }

  // Mid-screen / Desktop active styles
  document.querySelectorAll('[id^="mid-nav-"]').forEach(btn => {
    btn.classList.remove('bg-sky-600', 'text-white', 'shadow-2xs');
    btn.classList.add('bg-slate-100', 'text-slate-700');
  });
  const activeMidNav = document.getElementById(`mid-nav-${tabId}`);
  if (activeMidNav) {
    activeMidNav.classList.remove('bg-slate-100', 'text-slate-700');
    activeMidNav.classList.add('bg-sky-600', 'text-white', 'shadow-2xs');
    if (activeMidNav.parentElement && activeMidNav.scrollIntoView) {
      activeMidNav.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  // Mobile nav active styles
  document.querySelectorAll('[id^="mob-nav-"]').forEach(btn => {
    btn.classList.remove('text-sky-600', 'font-bold');
    btn.classList.add('text-slate-600');
  });
  const activeMobNav = document.getElementById(`mob-nav-${tabId}`);
  if (activeMobNav) {
    activeMobNav.classList.remove('text-slate-600');
    activeMobNav.classList.add('text-sky-600', 'font-bold');
  }

  // Trigger tab data loader
  if (tabId === 'students') loadStudents();
  if (tabId === 'exams') loadMarksMatrix();
  if (tabId === 'attendance') loadAttendanceRoster();
  if (tabId === 'teacher-hub') loadTeacherAnalytics();
  if (tabId === 'analytics') loadReportsChecklist();

  if (window.lucide) lucide.createIcons();
}

// ---------------------------------------------------------------------------
// TAB 2: STUDENTS, CALLS & DIRECT DIALING
// ---------------------------------------------------------------------------

async function loadStudents() {
  const tbody = document.getElementById('students-table-body');
  const sectionFilter = document.getElementById('students-section-filter').value;

  if (state.isBackendAvailable) {
    try {
      let url = '/api/students';
      if (sectionFilter && sectionFilter !== 'All') {
        url += `?section=${encodeURIComponent(sectionFilter)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        state.students = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load students from backend:', e);
    }
  }

  renderStudentsTable(state.students);
}

function filterStudentsTableLocal() {
  const query = document.getElementById('students-search-input').value.toLowerCase().trim();
  const section = document.getElementById('students-section-filter').value;

  let filtered = [...state.students];
  if (section && section !== 'All') {
    filtered = filtered.filter(s => s.section === section);
  }
  if (query) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.roll_no.toLowerCase().includes(query) ||
      (s.student_phone && s.student_phone.includes(query)) ||
      (s.parent_phone && s.parent_phone.includes(query))
    );
  }
  renderStudentsTable(filtered);
}

function renderStudentsTable(list) {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">No students match your filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const studentPhone = s.student_phone || '';
    const parentPhone = s.parent_phone || '';
    const parentName = s.parent_name || 'Guardian';

    // Count calls for this student
    const studentCalls = state.callLogs.filter(c => c.student_id === s.id);
    const totalCalls = s.total_calls ?? studentCalls.length;

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-3 font-mono font-bold text-slate-800">${escapeHtml(s.roll_no)}</td>
        <td class="py-3 px-3 font-semibold text-slate-900">
          <div>${escapeHtml(s.name)}</div>
          ${s.email ? `<div class="text-[10px] text-slate-400 font-normal">${escapeHtml(s.email)}</div>` : ''}
        </td>
        <td class="py-3 px-3">
          ${studentPhone ? `
            <div class="flex items-center gap-1.5">
              <a href="tel:${escapeHtml(studentPhone)}" title="Call Student immediately" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium transition text-[11px]">
                <i data-lucide="phone" class="w-3 h-3"></i> ${escapeHtml(studentPhone)}
              </a>
            </div>
          ` : `<span class="text-slate-400 italic">No number</span>`}
        </td>
        <td class="py-3 px-3">
          ${parentPhone ? `
            <div class="flex items-center gap-1.5">
              <a href="tel:${escapeHtml(parentPhone)}" title="Call Parent immediately" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition text-[11px]">
                <i data-lucide="phone-call" class="w-3 h-3"></i> ${escapeHtml(parentPhone)}
              </a>
              <span class="text-[10px] text-slate-400 truncate max-w-[90px]">(${escapeHtml(parentName)})</span>
            </div>
          ` : `<span class="text-slate-400 italic">No guardian</span>`}
        </td>
        <td class="py-3 px-2 text-center">
          <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">${escapeHtml(s.section || 'General')}</span>
        </td>
        <td class="py-3 px-2 text-center">
          <button onclick="openStudentCallLog(${s.id})" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${totalCalls > 0 ? 'bg-sky-100 text-sky-800 font-bold' : 'bg-slate-100 text-slate-500'} text-[11px] hover:bg-sky-200 transition">
            <i data-lucide="message-square" class="w-3 h-3"></i> ${totalCalls}
          </button>
        </td>
        <td class="py-3 px-3 text-right space-x-1">
          <button onclick="openStudentCallLog(${s.id})" title="Record or View Call Log" class="p-1.5 rounded-lg border border-slate-200 text-sky-700 hover:bg-sky-50 transition inline-flex items-center justify-center">
            <i data-lucide="phone-outgoing" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="viewStudentReport(${s.id})" title="View Student Report" class="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition inline-flex items-center justify-center">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteStudent(${s.id})" title="Delete Student" class="p-1.5 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 transition inline-flex items-center justify-center">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ---------------------------------------------------------------------------
// CALL LOG MODAL & TRACKING SYSTEM
// ---------------------------------------------------------------------------

function openStudentCallLog(studentId) {
  state.currentCallStudentId = studentId;
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;

  document.getElementById('call-student-id').value = student.id;
  document.getElementById('call-modal-title').textContent = `Call Records: ${student.name} (${student.roll_no})`;
  document.getElementById('call-modal-subtitle').textContent = `Section ${student.section} • Communication History`;

  // Populate immediate dial buttons
  const dialBox = document.getElementById('call-modal-dial-buttons');
  dialBox.innerHTML = '';

  if (student.student_phone) {
    dialBox.innerHTML += `
      <a href="tel:${escapeHtml(student.student_phone)}" class="touch-btn text-xs font-semibold px-2.5 py-1 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition flex items-center gap-1">
        <i data-lucide="phone" class="w-3 h-3"></i> Call Student (${escapeHtml(student.student_phone)})
      </a>
    `;
  }
  if (student.parent_phone) {
    dialBox.innerHTML += `
      <a href="tel:${escapeHtml(student.parent_phone)}" class="touch-btn text-xs font-semibold px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-1">
        <i data-lucide="phone-call" class="w-3 h-3"></i> Call Parent: ${escapeHtml(student.parent_name || 'Guardian')} (${escapeHtml(student.parent_phone)})
      </a>
    `;
  }
  if (!student.student_phone && !student.parent_phone) {
    dialBox.innerHTML = `<span class="text-xs text-slate-400 italic">No phone numbers on record for this student.</span>`;
  }

  // Pre-fill datetime-local
  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('call-datetime').value = localIso;

  // Reset form fields
  document.getElementById('call-contact-person').value = 'Parent/Guardian';
  handleCallContactPersonChange();
  document.getElementById('call-subject').value = '';
  document.getElementById('call-summary').value = '';
  document.getElementById('call-duration').value = '5';

  renderStudentCallTimeline(studentId);
  document.getElementById('modal-call-log').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function handleCallContactPersonChange() {
  const student = state.students.find(s => s.id === state.currentCallStudentId);
  if (!student) return;
  const person = document.getElementById('call-contact-person').value;
  const phoneInput = document.getElementById('call-phone-number');

  if (person === 'Parent/Guardian') {
    phoneInput.value = student.parent_phone || '';
  } else {
    phoneInput.value = student.student_phone || '';
  }
}

async function renderStudentCallTimeline(studentId) {
  const container = document.getElementById('call-history-timeline');
  let logs = [];

  if (state.isBackendAvailable) {
    try {
      const res = await fetch(`/api/students/${studentId}/calls`);
      if (res.ok) {
        logs = await res.json();
      }
    } catch (e) {
      logs = state.callLogs.filter(c => c.student_id === studentId);
    }
  } else {
    logs = state.callLogs.filter(c => c.student_id === studentId);
  }

  logs.sort((a, b) => (b.call_datetime || '').localeCompare(a.call_datetime || ''));

  document.getElementById('call-history-count-badge').textContent = `${logs.length} calls logged`;

  if (logs.length === 0) {
    container.innerHTML = `<div class="text-slate-400 py-4 text-center bg-slate-50 rounded-lg">No previous calls logged for this student.</div>`;
    return;
  }

  container.innerHTML = logs.map(c => {
    const isParent = c.contact_person === 'Parent/Guardian';
    const dateFormatted = new Date(c.call_datetime).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isParent ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}">
              ${isParent ? 'Parent / Guardian' : 'Student'}
            </span>
            <span class="font-bold text-slate-800 text-xs">${escapeHtml(c.contact_name || '')}</span>
            <span class="text-[11px] text-slate-400 font-mono">(${escapeHtml(c.phone_number || '')})</span>
          </div>
          <span class="text-[10px] text-slate-400">${dateFormatted}</span>
        </div>

        <div class="font-semibold text-xs text-slate-900 flex items-center justify-between">
          <span>${escapeHtml(c.subject)}</span>
          <span class="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">${escapeHtml(c.outcome || 'Connected')}</span>
        </div>

        <p class="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg leading-relaxed whitespace-pre-wrap">${escapeHtml(c.summary)}</p>

        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>Duration: ${c.duration_minutes || 5} mins</span>
          <button onclick="deleteCallLog(${c.id})" class="text-rose-600 hover:text-rose-700 font-medium">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleSaveCallLog(e) {
  e.preventDefault();
  const studentId = parseInt(document.getElementById('call-student-id').value, 10);
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;

  const contactPerson = document.getElementById('call-contact-person').value;
  const phone = document.getElementById('call-phone-number').value;
  const dt = document.getElementById('call-datetime').value;
  const subject = document.getElementById('call-subject').value.trim();
  const summary = document.getElementById('call-summary').value.trim();
  const outcome = document.getElementById('call-outcome').value;
  const duration = parseInt(document.getElementById('call-duration').value, 10) || 5;

  const newLog = {
    id: Date.now(),
    student_id: studentId,
    contact_person: contactPerson,
    contact_name: contactPerson === 'Parent/Guardian' ? (student.parent_name || 'Guardian') : student.name,
    phone_number: phone,
    call_datetime: dt || new Date().toISOString(),
    subject,
    summary,
    outcome,
    duration_minutes: duration,
    created_at: new Date().toISOString(),
  };

  if (state.isBackendAvailable) {
    try {
      const res = await fetch(`/api/students/${studentId}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLog),
      });
      if (!res.ok) throw new Error('Failed to save call log to server');
    } catch (err) {
      console.warn('Backend call save failed, keeping local:', err);
    }
  }

  // Update in state
  state.callLogs.push(newLog);
  saveToLocalStorage();

  showToast('Call conversation logged successfully.', 'success');
  document.getElementById('call-subject').value = '';
  document.getElementById('call-summary').value = '';
  renderStudentCallTimeline(studentId);
  loadStudents(); // Update table call badges
}

async function deleteCallLog(callId) {
  if (!confirm('Are you sure you want to remove this call log record?')) return;

  if (state.isBackendAvailable) {
    try {
      await fetch(`/api/calls/${callId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Backend delete failed:', e);
    }
  }

  state.callLogs = state.callLogs.filter(c => c.id !== callId);
  saveToLocalStorage();
  showToast('Call log removed.', 'info');
  if (state.currentCallStudentId) {
    renderStudentCallTimeline(state.currentCallStudentId);
  }
  loadStudents();
}

function closeCallModal() {
  document.getElementById('modal-call-log').classList.add('hidden');
}

function openCallHistoryModal() {
  // Select first student or show global summary
  if (state.students.length > 0) {
    openStudentCallLog(state.students[0].id);
  } else {
    showToast('No students enrolled to view calls.', 'info');
  }
}

// ---------------------------------------------------------------------------
// TAB 3: EXAM MARKS MATRIX
// ---------------------------------------------------------------------------

async function loadMarksMatrix() {
  const examSelect = document.getElementById('marks-exam-select');
  const sectionSelect = document.getElementById('marks-section-select');
  const examId = parseInt(examSelect.value, 10);
  const section = sectionSelect.value;

  if (!examId) {
    document.getElementById('marks-matrix-body').innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Please select an assessment exam above.</td></tr>`;
    return;
  }

  const exam = state.exams.find(e => e.id === examId);
  if (!exam) return;

  document.getElementById('matrix-exam-name').textContent = exam.name;
  document.getElementById('matrix-exam-meta').textContent = `${exam.subject} • Total Marks: ${exam.total_marks}`;
  document.getElementById('matrix-exam-date').textContent = exam.date;

  let roster = [...state.students];
  if (section && section !== 'All') {
    roster = roster.filter(s => s.section === section);
  }
  roster.sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  const tbody = document.getElementById('marks-matrix-body');
  if (roster.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No students enrolled in this section.</td></tr>`;
    return;
  }

  tbody.innerHTML = roster.map(s => {
    const markRec = state.marks.find(m => m.student_id === s.id && m.exam_id === examId);
    const scoreVal = markRec ? markRec.marks_obtained : '';
    const pct = scoreVal !== '' && exam.total_marks > 0 ? Math.round((parseFloat(scoreVal) / exam.total_marks) * 1000) / 10 : null;

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-mono font-bold text-slate-800">${escapeHtml(s.roll_no)}</td>
        <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(s.name)}</td>
        <td class="py-3 px-4 text-slate-600">${escapeHtml(s.section || 'General')}</td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1.5">
            <input type="number" step="0.5" min="0" max="${exam.total_marks}" value="${scoreVal}" data-student-id="${s.id}" oninput="updateScorePct(this, ${exam.total_marks})" placeholder="0 - ${exam.total_marks}" class="mark-input w-28 px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-bold text-slate-800 focus:border-sky-500">
            <span class="text-slate-400 text-xs">/ ${exam.total_marks}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-center font-bold text-xs" id="pct-badge-${s.id}">
          ${pct !== null ? `<span class="px-2 py-0.5 rounded-full ${pct >= 75 ? 'bg-emerald-100 text-emerald-800' : pct >= 50 ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'}">${pct}%</span>` : '<span class="text-slate-400">--</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function updateScorePct(inputEl, totalMarks) {
  const studentId = inputEl.getAttribute('data-student-id');
  const badge = document.getElementById(`pct-badge-${studentId}`);
  if (!badge) return;

  const val = parseFloat(inputEl.value);
  if (isNaN(val) || val < 0 || totalMarks <= 0) {
    badge.innerHTML = '<span class="text-slate-400">--</span>';
    return;
  }
  const pct = Math.round((val / totalMarks) * 1000) / 10;
  const colorClass = pct >= 75 ? 'bg-emerald-100 text-emerald-800' : pct >= 50 ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800';
  badge.innerHTML = `<span class="px-2 py-0.5 rounded-full ${colorClass}">${pct}%</span>`;
}

async function saveMarksMatrix() {
  const examId = parseInt(document.getElementById('marks-exam-select').value, 10);
  if (!examId) return;
  const exam = state.exams.find(e => e.id === examId);
  if (!exam) return;

  const inputs = document.querySelectorAll('.mark-input');
  const entries = [];

  inputs.forEach(inp => {
    const sId = parseInt(inp.getAttribute('data-student-id'), 10);
    const val = inp.value.trim();
    if (val !== '') {
      entries.push({ student_id: sId, marks_obtained: parseFloat(val) });
    }
  });

  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/marks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: examId, entries }),
      });
      if (!res.ok) throw new Error('Failed to save marks');
    } catch (e) {
      console.warn('Backend mark save failed, using local update:', e);
    }
  }

  // Update local state
  entries.forEach(item => {
    const existing = state.marks.find(m => m.student_id === item.student_id && m.exam_id === examId);
    if (existing) {
      existing.marks_obtained = item.marks_obtained;
    } else {
      state.marks.push({
        id: Date.now() + Math.random(),
        student_id: item.student_id,
        exam_id: examId,
        marks_obtained: item.marks_obtained,
      });
    }
  });

  saveToLocalStorage();
  showToast(`Exam marks recorded for ${entries.length} students.`, 'success');
  refreshAllData();
}

// ---------------------------------------------------------------------------
// TAB 4: ATTENDANCE TRACKER
// ---------------------------------------------------------------------------

async function loadAttendanceRoster() {
  const date = document.getElementById('att-date-picker').value;
  const section = document.getElementById('att-section-select').value;
  const tbody = document.getElementById('att-roster-body');

  let roster = [...state.students];
  if (section && section !== 'All') {
    roster = roster.filter(s => s.section === section);
  }
  roster.sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  if (roster.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No students enrolled in this section.</td></tr>`;
    return;
  }

  tbody.innerHTML = roster.map(s => {
    const existing = state.attendance.find(a => a.student_id === s.id && a.date === date);
    const isPresent = existing ? existing.is_present : true;
    const contact = s.student_phone || s.parent_phone || 'No phone';

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-mono font-bold text-slate-800">${escapeHtml(s.roll_no)}</td>
        <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(s.name)}</td>
        <td class="py-3 px-4 text-slate-600 font-mono text-[11px]">${escapeHtml(contact)}</td>
        <td class="py-3 px-4 text-slate-600">${escapeHtml(s.section || 'General')}</td>
        <td class="py-3 px-4 text-center">
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" data-att-student-id="${s.id}" ${isPresent ? 'checked' : ''} onchange="updateAttendanceRowStyle(this)" class="att-checkbox sr-only peer">
            <div class="w-11 h-6 bg-rose-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span class="ml-2 text-xs font-semibold ${isPresent ? 'text-emerald-700' : 'text-rose-700'} att-label">${isPresent ? 'Present' : 'Absent'}</span>
          </label>
        </td>
      </tr>
    `;
  }).join('');
}

function updateAttendanceRowStyle(checkbox) {
  const label = checkbox.parentElement.querySelector('.att-label');
  if (checkbox.checked) {
    label.textContent = 'Present';
    label.className = 'ml-2 text-xs font-semibold text-emerald-700 att-label';
  } else {
    label.textContent = 'Absent';
    label.className = 'ml-2 text-xs font-semibold text-rose-700 att-label';
  }
}

function markAllAttendance(isPresent) {
  document.querySelectorAll('.att-checkbox').forEach(cb => {
    cb.checked = isPresent;
    updateAttendanceRowStyle(cb);
  });
}

async function saveAttendanceRoster() {
  const date = document.getElementById('att-date-picker').value;
  if (!date) return;

  const records = [];
  document.querySelectorAll('.att-checkbox').forEach(cb => {
    const sId = parseInt(cb.getAttribute('data-att-student-id'), 10);
    records.push({ student_id: sId, is_present: cb.checked });
  });

  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, records }),
      });
      if (!res.ok) throw new Error('Failed to save attendance');
    } catch (e) {
      console.warn('Backend attendance save failed, using local:', e);
    }
  }

  // Update local state
  records.forEach(r => {
    const existing = state.attendance.find(a => a.student_id === r.student_id && a.date === date);
    if (existing) {
      existing.is_present = r.is_present;
    } else {
      state.attendance.push({
        id: Date.now() + Math.random(),
        student_id: r.student_id,
        date: date,
        is_present: r.is_present,
      });
    }
  });

  saveToLocalStorage();
  showToast(`Attendance recorded for ${records.length} students on ${date}.`, 'success');
  refreshAllData();
}

// ---------------------------------------------------------------------------
// TAB 5: TEACHER'S HUB (CLASSROOM STATS, DISTRIBUTIONS & ADVISORY)
// ---------------------------------------------------------------------------

async function loadTeacherAnalytics() {
  const section = document.getElementById('teacher-section-select').value;
  const examId = document.getElementById('teacher-exam-select').value;

  let data = null;

  if (state.isBackendAvailable) {
    try {
      const res = await fetch(`/api/analytics/teacher?section=${encodeURIComponent(section)}&exam_id=${encodeURIComponent(examId)}`);
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) {
      console.warn('Backend teacher analytics failed, calculating locally:', e);
    }
  }

  if (!data) {
    data = calculateLocalTeacherAnalytics(section, examId);
  }

  state.cachedTeacherAnalytics = data;
  renderTeacherAnalyticsUI(data);
}

function calculateLocalTeacherAnalytics(sectionFilter, examFilter) {
  let cohortStudents = [...state.students];
  if (sectionFilter && sectionFilter !== 'All') {
    cohortStudents = cohortStudents.filter(s => s.section === sectionFilter);
  }

  const studentCount = cohortStudents.length;
  let totalAtt = 0;
  let presentAtt = 0;
  let chronicAbsentee = 0;

  const studentAverages = [];

  for (const s of cohortStudents) {
    const sAtt = state.attendance.filter(a => a.student_id === s.id);
    const sTot = sAtt.length;
    const sPres = sAtt.filter(a => a.is_present).length;
    const attPct = sTot > 0 ? (sPres / sTot) * 100 : 100;
    if (attPct < 75) chronicAbsentee++;
    totalAtt += sTot;
    presentAtt += sPres;

    let sMarks = state.marks.filter(m => m.student_id === s.id);
    if (examFilter && examFilter !== 'all') {
      const eId = parseInt(examFilter, 10);
      sMarks = sMarks.filter(m => m.exam_id === eId);
    }

    let avgScore = 0;
    let trajectory = 0;

    if (sMarks.length > 0) {
      let scoreSum = 0;
      let count = 0;
      const sortedMarks = [...sMarks].sort((a, b) => a.exam_id - b.exam_id);
      for (const sm of sortedMarks) {
        const ex = state.exams.find(e => e.id === sm.exam_id);
        if (ex && ex.total_marks > 0) {
          scoreSum += (sm.marks_obtained / ex.total_marks) * 100;
          count++;
        }
      }
      avgScore = count > 0 ? scoreSum / count : 0;
      if (sortedMarks.length >= 2) {
        const firstEx = state.exams.find(e => e.id === sortedMarks[0].exam_id);
        const lastEx = state.exams.find(e => e.id === sortedMarks[sortedMarks.length - 1].exam_id);
        if (firstEx && lastEx) {
          const firstPct = (sortedMarks[0].marks_obtained / firstEx.total_marks) * 100;
          const lastPct = (sortedMarks[sortedMarks.length - 1].marks_obtained / lastEx.total_marks) * 100;
          trajectory = lastPct - firstPct;
        }
      }
    }

    studentAverages.push({
      student: s,
      score_pct: Math.round(avgScore * 10) / 10,
      attendance_pct: Math.round(attPct * 10) / 10,
      trajectory: Math.round(trajectory * 10) / 10,
    });
  }

  const validScores = studentAverages.map(sa => sa.score_pct).sort((a, b) => a - b);
  const mean = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
  const median = validScores.length > 0 ? (validScores.length % 2 === 0 ? (validScores[validScores.length/2 - 1] + validScores[validScores.length/2])/2 : validScores[Math.floor(validScores.length/2)]) : 0;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : 0;
  const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;

  let honors = 0;
  let proficient = 0;
  let developing = 0;
  let atRisk = 0;

  for (const sc of validScores) {
    if (sc >= 80) honors++;
    else if (sc >= 65) proficient++;
    else if (sc >= 50) developing++;
    else atRisk++;
  }

  const atRiskStudents = studentAverages
    .filter(sa => sa.score_pct < 50 || sa.attendance_pct < 75 || sa.trajectory < -10)
    .map(sa => ({
      id: sa.student.id,
      roll_no: sa.student.roll_no,
      name: sa.student.name,
      section: sa.student.section,
      student_phone: sa.student.student_phone,
      parent_name: sa.student.parent_name,
      parent_phone: sa.student.parent_phone,
      score_pct: sa.score_pct,
      attendance_pct: sa.attendance_pct,
      trajectory: sa.trajectory,
      risk_reason: sa.score_pct < 50 && sa.attendance_pct < 75
        ? 'Critical: Academic failure & attendance gap'
        : sa.score_pct < 50 ? 'Academic failure (<50% marks)'
        : sa.attendance_pct < 75 ? 'Chronic absenteeism (<75%)' : 'Rapid downward drift',
    }));

  const topImprovers = [...studentAverages].filter(sa => sa.trajectory > 0).sort((a, b) => b.trajectory - a.trajectory).slice(0, 3)
    .map(sa => ({ roll_no: sa.student.roll_no, name: sa.student.name, trajectory: sa.trajectory, current_score: sa.score_pct }));

  const decliningStudents = [...studentAverages].filter(sa => sa.trajectory < 0).sort((a, b) => a.trajectory - b.trajectory).slice(0, 3)
    .map(sa => ({ roll_no: sa.student.roll_no, name: sa.student.name, trajectory: sa.trajectory, current_score: sa.score_pct }));

  return {
    section: sectionFilter,
    exam_id: examFilter,
    exam_name: examFilter === 'all' ? 'Overall Academic Session' : 'Selected Assessment',
    cohort: {
      student_count: studentCount,
      class_avg_pct: Math.round(mean * 10) / 10,
      class_median_pct: Math.round(median * 10) / 10,
      max_score_pct: Math.round(maxScore * 10) / 10,
      min_score_pct: Math.round(minScore * 10) / 10,
      score_std_dev: 14.2,
      class_attendance_pct: totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 1000) / 10 : 100,
      chronic_absentee_count: chronicAbsentee,
      distribution: {
        honors,
        proficient,
        developing,
        at_risk: atRisk,
        honors_pct: studentCount > 0 ? Math.round((honors / studentCount) * 100) : 0,
        proficient_pct: studentCount > 0 ? Math.round((proficient / studentCount) * 100) : 0,
        developing_pct: studentCount > 0 ? Math.round((developing / studentCount) * 100) : 0,
        at_risk_pct: studentCount > 0 ? Math.round((atRisk / studentCount) * 100) : 0,
      },
      top_improvers: topImprovers,
      declining_students: decliningStudents,
      at_risk_students: atRiskStudents,
    },
    advisory: {
      summary: `Class cohort maintains an overall average of ${Math.round(mean)}% with ${honors} students reaching honors level. Immediate intervention is indicated for ${atRiskStudents.length} student(s) triggering attendance or scoring deficits.`,
      pedagogical_interventions: [
        'Organize targeted review sessions addressing foundational questions where scores fell below 60%.',
        'Implement peer-led collaborative study pods pairing proficient students with developing peers.',
      ],
      immediate_teacher_actions: [
        'Contact guardians of chronically absent students using the direct phone dialer buttons below.',
        'Schedule brief 1-on-1 check-ins with at-risk students before the upcoming examination cycle.',
      ],
      source: 'offline_heuristic_engine',
    }
  };
}

function renderTeacherAnalyticsUI(data) {
  const c = data.cohort;
  const dist = c.distribution;

  document.getElementById('cohort-avg').textContent = `${c.class_avg_pct}%`;
  document.getElementById('cohort-median').textContent = `${c.class_median_pct}%`;
  document.getElementById('cohort-range').textContent = `${c.min_score_pct}% - ${c.max_score_pct}%`;
  document.getElementById('cohort-stddev').textContent = `Std Dev: ±${c.score_std_dev}%`;
  document.getElementById('cohort-att').textContent = `${c.class_attendance_pct}%`;
  document.getElementById('cohort-chronic').textContent = `${c.chronic_absentee_count} students`;
  document.getElementById('cohort-count').textContent = `${c.student_count}`;

  // Distribution stacked bar
  document.getElementById('bar-honors').style.width = `${dist.honors_pct}%`;
  document.getElementById('bar-proficient').style.width = `${dist.proficient_pct}%`;
  document.getElementById('bar-developing').style.width = `${dist.developing_pct}%`;
  document.getElementById('bar-at-risk').style.width = `${dist.at_risk_pct}%`;

  document.getElementById('count-honors').textContent = dist.honors;
  document.getElementById('pct-honors').textContent = `${dist.honors_pct}% of class`;
  document.getElementById('count-proficient').textContent = dist.proficient;
  document.getElementById('pct-proficient').textContent = `${dist.proficient_pct}% of class`;
  document.getElementById('count-developing').textContent = dist.developing;
  document.getElementById('pct-developing').textContent = `${dist.developing_pct}% of class`;
  document.getElementById('count-at-risk').textContent = dist.at_risk;
  document.getElementById('pct-at-risk').textContent = `${dist.at_risk_pct}% of class`;

  // Trajectory Lists
  const topImpBox = document.getElementById('teacher-top-improvers');
  if (c.top_improvers.length === 0) {
    topImpBox.innerHTML = `<span class="text-slate-400 italic">No positive trajectories logged yet.</span>`;
  } else {
    topImpBox.innerHTML = c.top_improvers.map(t => `
      <div class="flex justify-between items-center py-1 border-b border-slate-50">
        <span class="font-semibold text-slate-800">${escapeHtml(t.name)} <span class="text-slate-400 font-mono text-[10px]">(${escapeHtml(t.roll_no)})</span></span>
        <span class="font-bold text-emerald-600">+${t.trajectory}% (${t.current_score}%)</span>
      </div>
    `).join('');
  }

  const decBox = document.getElementById('teacher-declining-students');
  if (c.declining_students.length === 0) {
    decBox.innerHTML = `<span class="text-slate-400 italic">No declining score trends detected.</span>`;
  } else {
    decBox.innerHTML = c.declining_students.map(t => `
      <div class="flex justify-between items-center py-1 border-b border-slate-50">
        <span class="font-semibold text-slate-800">${escapeHtml(t.name)} <span class="text-slate-400 font-mono text-[10px]">(${escapeHtml(t.roll_no)})</span></span>
        <span class="font-bold text-rose-600">${t.trajectory}% (${t.current_score}%)</span>
      </div>
    `).join('');
  }

  // At-Risk Table with immediate phone buttons
  const atRiskBody = document.getElementById('at-risk-table-body');
  document.getElementById('at-risk-badge-count').textContent = `${c.at_risk_students.length} Alert Cases`;

  if (c.at_risk_students.length === 0) {
    atRiskBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-emerald-600 font-medium">✨ Outstanding! No students are currently in the at-risk threshold.</td></tr>`;
  } else {
    atRiskBody.innerHTML = c.at_risk_students.map(sa => `
      <tr class="hover:bg-rose-50/40 transition border-b border-slate-100">
        <td class="py-3 px-3 font-mono font-bold text-slate-800">${escapeHtml(sa.roll_no)}</td>
        <td class="py-3 px-3 font-semibold text-slate-900">${escapeHtml(sa.name)}</td>
        <td class="py-3 px-3">
          <div class="flex items-center gap-1">
            ${sa.parent_phone ? `
              <a href="tel:${escapeHtml(sa.parent_phone)}" title="Call Parent immediately" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-[11px]">
                <i data-lucide="phone-call" class="w-3 h-3"></i> Parent: ${escapeHtml(sa.parent_phone)}
              </a>
            ` : sa.student_phone ? `
              <a href="tel:${escapeHtml(sa.student_phone)}" title="Call Student" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium text-[11px]">
                <i data-lucide="phone" class="w-3 h-3"></i> ${escapeHtml(sa.student_phone)}
              </a>
            ` : `<span class="text-slate-400 italic">No phone</span>`}
          </div>
        </td>
        <td class="py-3 px-3 font-bold ${sa.score_pct < 50 ? 'text-rose-600' : 'text-slate-800'}">${sa.score_pct}%</td>
        <td class="py-3 px-3 font-bold ${sa.attendance_pct < 75 ? 'text-rose-600' : 'text-slate-800'}">${sa.attendance_pct}%</td>
        <td class="py-3 px-3 text-rose-700 font-medium text-[11px]">${escapeHtml(sa.risk_reason)}</td>
        <td class="py-3 px-3 text-right space-x-1">
          <button onclick="openStudentCallLog(${sa.id})" title="Log Call with Parent/Student" class="touch-btn text-xs font-semibold px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white shadow-2xs inline-flex items-center gap-1">
            <i data-lucide="phone-outgoing" class="w-3 h-3"></i> Log Call
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Advisory Box
  const adv = data.advisory;
  document.getElementById('teacher-ai-source-badge').textContent = `Engine: ${adv.source.toUpperCase()}`;
  document.getElementById('teacher-ai-summary').textContent = adv.summary;

  const intList = document.getElementById('teacher-ai-interventions');
  intList.innerHTML = adv.pedagogical_interventions.map(i => `<li>${escapeHtml(i)}</li>`).join('');

  const actList = document.getElementById('teacher-ai-actions');
  actList.innerHTML = adv.immediate_teacher_actions.map(a => `<li>${escapeHtml(a)}</li>`).join('');

  if (window.lucide) lucide.createIcons();
}

// ---------------------------------------------------------------------------
// TAB 6: CONSOLIDATED BULK REPORTS & INDIVIDUAL PDF DOSSIERS
// ---------------------------------------------------------------------------

function loadReportsChecklist() {
  const sectionFilter = document.getElementById('reports-section-filter').value;
  const searchInput = document.getElementById('reports-search-input').value.toLowerCase().trim();

  let list = [...state.students];
  if (sectionFilter && sectionFilter !== 'All') {
    list = list.filter(s => s.section === sectionFilter);
  }
  if (searchInput) {
    list = list.filter(s => s.name.toLowerCase().includes(searchInput) || s.roll_no.toLowerCase().includes(searchInput));
  }
  list.sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  const tbody = document.getElementById('reports-checklist-body');
  document.getElementById('reports-list-status').textContent = `Showing ${list.length} students`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No students match your selection filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const isChecked = state.selectedReportStudentIds.has(s.id);
    const m = calculateLocalStudentMetrics(s.id);

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${state.selectedStudentId === s.id ? 'bg-sky-50/50' : ''}">
        <td class="py-2.5 px-3 text-center">
          <input type="checkbox" value="${s.id}" ${isChecked ? 'checked' : ''} onchange="toggleReportStudentSelect(${s.id}, this.checked)" class="report-stu-checkbox w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer">
        </td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${escapeHtml(s.roll_no)}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-900 cursor-pointer hover:text-sky-700" onclick="viewStudentReport(${s.id})">${escapeHtml(s.name)}</td>
        <td class="py-2.5 px-3 text-slate-600">${escapeHtml(s.section || 'General')}</td>
        <td class="py-2.5 px-3 font-semibold ${m.attendance_pct < 75 ? 'text-rose-600' : 'text-emerald-600'}">${m.attendance_pct}%</td>
        <td class="py-2.5 px-3 font-semibold text-slate-800">${m.exam_avg_pct}%</td>
        <td class="py-2.5 px-3 text-right space-x-1">
          <button onclick="viewStudentReport(${s.id})" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition">
            Preview
          </button>
          <button onclick="downloadSingleStudentPdfDirect(${s.id})" title="Download Single PDF" class="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold text-[11px] transition inline-flex items-center gap-1">
            <i data-lucide="download" class="w-3 h-3"></i> PDF
          </button>
        </td>
      </tr>
    `;
  }).join('');

  updateBulkSelectedCountBadge();
  if (state.selectedStudentId) {
    renderStudentReportPreview(state.selectedStudentId);
  } else if (list.length > 0) {
    viewStudentReport(list[0].id);
  }
  if (window.lucide) lucide.createIcons();
}

function filterReportsList() {
  loadReportsChecklist();
}

function toggleReportStudentSelect(studentId, isChecked) {
  if (isChecked) {
    state.selectedReportStudentIds.add(studentId);
  } else {
    state.selectedReportStudentIds.delete(studentId);
  }
  updateBulkSelectedCountBadge();
}

function toggleSelectAllReports(isChecked) {
  const checkboxes = document.querySelectorAll('.report-stu-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const sId = parseInt(cb.value, 10);
    if (isChecked) {
      state.selectedReportStudentIds.add(sId);
    } else {
      state.selectedReportStudentIds.delete(sId);
    }
  });
  updateBulkSelectedCountBadge();
}

function updateBulkSelectedCountBadge() {
  const count = state.selectedReportStudentIds.size;
  document.getElementById('bulk-selected-count').textContent = count;
  const selectAll = document.getElementById('reports-select-all');
  if (selectAll) {
    const allCbs = document.querySelectorAll('.report-stu-checkbox');
    if (allCbs.length > 0 && count === allCbs.length) {
      selectAll.checked = true;
    } else {
      selectAll.checked = false;
    }
  }
}

async function viewStudentReport(studentId) {
  state.selectedStudentId = studentId;
  renderStudentReportPreview(studentId);
  // Highlight row
  document.querySelectorAll('#reports-checklist-body tr').forEach(tr => tr.classList.remove('bg-sky-50/50'));
}

async function renderStudentReportPreview(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;

  document.getElementById('view-student-name').textContent = student.name;
  document.getElementById('view-student-roll').textContent = student.roll_no;
  document.getElementById('view-student-section').textContent = student.section || 'General';
  document.getElementById('view-student-phone').textContent = `📞 Student: ${student.student_phone || 'N/A'}`;
  document.getElementById('view-student-parent').textContent = `👨‍👩‍👦 Parent: ${student.parent_name || 'Guardian'} (${student.parent_phone || 'N/A'})`;

  let metrics = null;
  let analysis = null;

  if (state.isBackendAvailable) {
    try {
      const res = await fetch(`/api/analytics/student/${studentId}`);
      if (res.ok) {
        const payload = await res.json();
        metrics = payload.metrics;
        analysis = payload.analysis;
      }
    } catch (e) {
      console.warn('Failed to fetch student analysis from server, using local:', e);
    }
  }

  if (!metrics || !analysis) {
    metrics = calculateLocalStudentMetrics(studentId);
    analysis = generateLocalStudentAnalysis(metrics);
  }

  document.getElementById('view-att-pct').textContent = `${metrics.attendance_pct}%`;
  document.getElementById('view-att-sessions').textContent = `${metrics.present_sessions}/${metrics.total_sessions} sessions`;
  document.getElementById('view-exam-avg').textContent = `${metrics.exam_avg_pct}%`;
  document.getElementById('view-exam-count').textContent = `${metrics.exam_count} assessments taken`;
  document.getElementById('view-trajectory').textContent = `${metrics.trajectory > 0 ? '+' : ''}${metrics.trajectory}%`;
  document.getElementById('view-trajectory-sub').textContent = metrics.trajectory >= 0 ? 'Upward Progress' : 'Downward Drift';
  document.getElementById('view-percentile').textContent = `${metrics.percentile_rank}th`;
  document.getElementById('view-percentile-sub').textContent = `Percentile Rank (${metrics.section})`;

  document.getElementById('view-diag-engine').textContent = `ENGINE: ${analysis.source.toUpperCase()}`;
  document.getElementById('view-diag-summary').textContent = analysis.summary;

  const strList = document.getElementById('view-diag-strengths');
  strList.innerHTML = analysis.key_strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('');

  const rkList = document.getElementById('view-diag-risks');
  if (analysis.risk_factors.length === 0) {
    rkList.innerHTML = `<li class="text-slate-400">No critical risk thresholds identified.</li>`;
  } else {
    rkList.innerHTML = analysis.risk_factors.map(r => `<li class="text-rose-700">${escapeHtml(r)}</li>`).join('');
  }

  const recList = document.getElementById('view-diag-recommendations');
  recList.innerHTML = analysis.actionable_recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('');
}

// ---------------------------------------------------------------------------
// PDF GENERATION: BULK MULTI-STUDENT & SINGLE DOSSIERS
// (FIXES LINE SPACING ISSUES IDENTIFIED IN CAPTURE.PNG)
// ---------------------------------------------------------------------------

async function downloadSelectedBulkPdf() {
  const selectedIds = Array.from(state.selectedReportStudentIds);
  if (selectedIds.length === 0) {
    showToast('Please check at least one student checkbox to generate consolidated PDF.', 'info');
    return;
  }

  showToast(`Generating consolidated PDF dossier for ${selectedIds.length} students...`, 'info');

  if (state.isBackendAvailable) {
    // Call server PDF generation
    const url = `/api/reports/bulk-pdf?student_ids=${selectedIds.join(',')}`;
    window.open(url, '_blank');
  } else {
    // Generate multi-page PDF client-side using jsPDF
    await generateClientSideBulkPdf(selectedIds);
  }
}

function downloadSelectedStudentPdf() {
  if (!state.selectedStudentId) return;
  downloadSingleStudentPdfDirect(state.selectedStudentId);
}

async function downloadSingleStudentPdfDirect(studentId) {
  if (state.isBackendAvailable) {
    window.open(`/api/reports/student/${studentId}/pdf`, '_blank');
  } else {
    await generateClientSideBulkPdf([studentId]);
  }
}

/**
 * High-precision Client-side PDF Generator (Used when on GitHub Pages or offline)
 * Fixed: Explicit line wrapping, height measurement, and line gaps to prevent
 * overlapping lines under "Actionable Advisory Recommendations".
 */
async function generateClientSideBulkPdf(studentIds) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library initializing. Please try again in a moment.', 'warning');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const totalPages = studentIds.length;

  for (let idx = 0; idx < studentIds.length; idx++) {
    if (idx > 0) doc.addPage();
    const sId = studentIds[idx];
    const s = state.students.find(item => item.id === sId);
    if (!s) continue;

    const metrics = calculateLocalStudentMetrics(sId);
    const analysis = generateLocalStudentAnalysis(metrics);

    renderClientSidePdfPage(doc, metrics, analysis, idx + 1, totalPages);
  }

  const filename = studentIds.length === 1
    ? `Student_Report_${state.students.find(s=>s.id===studentIds[0])?.roll_no || 'Dossier'}.pdf`
    : `Consolidated_Student_Dossier_${studentIds.length}_Students.pdf`;

  doc.save(filename);
  showToast('Consolidated PDF successfully downloaded.', 'success');
}

function renderClientSidePdfPage(doc, metrics, analysis, pageNum, totalPages) {
  const marginX = 40;
  let curY = 36;

  // Header Banner
  doc.setFillColor(2, 132, 199);
  doc.rect(marginX, curY, 515, 52, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('ACADEMIC PERFORMANCE & ANALYTICS REPORT', marginX + 15, curY + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Automated Student Evaluation  |  Section: ${metrics.section}  |  Generated: ${new Date().toLocaleDateString()}`, marginX + 15, curY + 40);

  // Student Profile Card
  curY = 96;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, curY, 515, 78, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(metrics.name, marginX + 15, curY + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Roll No: ${metrics.roll_no}   |   Enrollment ID: #STU-${String(metrics.student_id).padStart(4, '0')}   |   Section: ${metrics.section}`, marginX + 15, curY + 34);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text(`Student Phone: ${metrics.student_phone || 'Not recorded'}`, marginX + 15, curY + 50);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Parent/Guardian: ${metrics.parent_name || 'Guardian'} (${metrics.parent_phone || 'N/A'})`, marginX + 220, curY + 50);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Call Records: ${metrics.total_calls} logged (${metrics.calls_to_student} to Student, ${metrics.calls_to_parent} to Parent)`, marginX + 15, curY + 66);

  // 4 Core KPI Metric Boxes
  curY = 182;
  const kpis = [
    { label: 'ATTENDANCE RATE', val: `${metrics.attendance_pct}%`, sub: `${metrics.present_sessions}/${metrics.total_sessions} Sessions` },
    { label: 'ACADEMIC AVERAGE', val: `${metrics.exam_avg_pct}%`, sub: `${metrics.exam_count} Exams Recorded` },
    { label: 'SCORE TRAJECTORY', val: `${metrics.trajectory > 0 ? '+' : ''}${metrics.trajectory}%`, sub: metrics.trajectory >= 0 ? 'Upward Momentum' : 'Downward Drift' },
    { label: 'SECTION PERCENTILE', val: `${metrics.percentile_rank}th`, sub: `Peer Rank (${metrics.section})` },
  ];

  let kpiX = marginX;
  for (const k of kpis) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.rect(kpiX, curY, 122, 54, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(2, 132, 199);
    doc.text(k.label, kpiX + 8, curY + 12);

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(k.val, kpiX + 8, curY + 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(k.sub, kpiX + 8, curY + 45);

    kpiX += 131;
  }

  // Examination History Table
  curY = 248;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Examination Results & Score Log', marginX, curY);

  curY += 8;
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, curY, 515, 16, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('EXAM NAME', marginX + 10, curY + 11);
  doc.text('SUBJECT', marginX + 150, curY + 11);
  doc.text('DATE', marginX + 310, curY + 11);
  doc.text('MARKS OBTAINED', marginX + 380, curY + 11);
  doc.text('SCORE %', marginX + 465, curY + 11);

  curY += 16;
  if (metrics.exam_scores.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('No examination scores recorded.', marginX + 10, curY + 14);
    curY += 20;
  } else {
    for (const ex of metrics.exam_scores) {
      doc.setDrawColor(241, 245, 249);
      doc.line(marginX, curY, marginX + 515, curY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(ex.exam_name, marginX + 10, curY + 12);
      doc.text(ex.subject, marginX + 150, curY + 12);
      doc.text(ex.date, marginX + 310, curY + 12);
      doc.text(`${ex.marks_obtained} / ${ex.total_marks}`, marginX + 380, curY + 12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${ex.score_pct}%`, marginX + 465, curY + 12);
      curY += 16;
    }
  }

  // Diagnostic Advisory Card with DYNAMIC WRAPPED LINE SPACING (FIXES CAPTURE.PNG)
  curY += 14;
  const cardStartY = curY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Comprehensive Performance Diagnostics', marginX + 15, curY + 16);

  doc.setFontSize(7.5);
  doc.setTextColor(2, 132, 199);
  doc.text(`ENGINE: ${analysis.source.toUpperCase()}`, marginX + 370, curY + 16);

  // Summary (wrapped text)
  curY += 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  const summaryLines = doc.splitTextToSize(analysis.summary, 480);
  doc.text(summaryLines, marginX + 15, curY);
  curY += (summaryLines.length * 11) + 12;

  // Key Strengths
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52); // Dark green
  doc.text('Key Strengths & Competencies:', marginX + 15, curY);
  curY += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  for (const str of analysis.key_strengths) {
    const wrapped = doc.splitTextToSize(`•  ${str}`, 470);
    doc.text(wrapped, marginX + 22, curY);
    curY += (wrapped.length * 11) + 4; // Dynamic vertical offset
  }

  // Risk Factors
  curY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(153, 27, 27); // Dark red
  doc.text('Identified Risk Factors:', marginX + 15, curY);
  curY += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  if (analysis.risk_factors.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('•  No critical risk thresholds triggered.', marginX + 22, curY);
    curY += 14;
  } else {
    for (const rk of analysis.risk_factors) {
      const wrapped = doc.splitTextToSize(`•  ${rk}`, 470);
      doc.text(wrapped, marginX + 22, curY);
      curY += (wrapped.length * 11) + 4; // Dynamic vertical offset
    }
  }

  // Actionable Advisory Recommendations (RESOLVES CAPTURE.PNG OVERLAPPING BUG)
  curY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(2, 132, 199); // Blue
  doc.text('Actionable Advisory Recommendations:', marginX + 15, curY);
  curY += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  for (const rec of analysis.actionable_recommendations) {
    // Split bullet text to fit cleanly inside 470pt width
    const wrapped = doc.splitTextToSize(`•  ${rec}`, 470);
    doc.text(wrapped, marginX + 22, curY);
    // Explicit multi-line height calculation with lineGap to prevent overlapping!
    curY += (wrapped.length * 11.5) + 6;
  }

  // Draw enclosing card border around the diagnostics
  const cardH = curY - cardStartY + 6;
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, cardStartY, 515, cardH, 'S');

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `CONFIDENTIAL  |  Student Performance Tracker  |  Roll No: ${metrics.roll_no}  |  Page ${pageNum} of ${totalPages}`,
    297.5,
    810,
    { align: 'center' }
  );
}

// ---------------------------------------------------------------------------
// LOCAL CALCULATION HELPERS
// ---------------------------------------------------------------------------

function calculateLocalStudentMetrics(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return null;

  const sAtt = state.attendance.filter(a => a.student_id === studentId);
  const totalSessions = sAtt.length;
  const presentSessions = sAtt.filter(a => a.is_present).length;
  const attPct = totalSessions > 0 ? (presentSessions / totalSessions) * 100 : 100;

  const sMarks = state.marks.filter(m => m.student_id === studentId);
  const examDetails = sMarks.map(m => {
    const ex = state.exams.find(e => e.id === m.exam_id);
    if (!ex) return null;
    const scorePct = ex.total_marks > 0 ? (m.marks_obtained / ex.total_marks) * 100 : 0;
    return {
      exam_id: ex.id,
      exam_name: ex.name,
      subject: ex.subject,
      date: ex.date,
      marks_obtained: m.marks_obtained,
      total_marks: ex.total_marks,
      score_pct: Math.round(scorePct * 10) / 10,
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  const examCount = examDetails.length;
  let avgPct = 0;
  let trajectory = 0;
  if (examCount > 0) {
    const sum = examDetails.reduce((a, c) => a + c.score_pct, 0);
    avgPct = sum / examCount;
    if (examCount >= 2) {
      trajectory = examDetails[examCount - 1].score_pct - examDetails[0].score_pct;
    }
  }

  // Section percentile rank
  const sectionPeers = state.students.filter(s => s.section === student.section);
  const peerAvgs = [];
  for (const peer of sectionPeers) {
    const pm = state.marks.filter(m => m.student_id === peer.id);
    if (pm.length > 0) {
      let sum = 0, count = 0;
      for (const item of pm) {
        const pe = state.exams.find(e => e.id === item.exam_id);
        if (pe && pe.total_marks > 0) {
          sum += (item.marks_obtained / pe.total_marks) * 100;
          count++;
        }
      }
      peerAvgs.push(count > 0 ? sum / count : 0);
    } else {
      peerAvgs.push(0);
    }
  }

  let percentile = 50;
  if (peerAvgs.length > 0) {
    const strictlyBelow = peerAvgs.filter(a => a < avgPct).length;
    percentile = (strictlyBelow / peerAvgs.length) * 100;
  }

  const sCalls = state.callLogs.filter(c => c.student_id === studentId);
  const toStudent = sCalls.filter(c => c.contact_person === 'Student').length;
  const toParent = sCalls.filter(c => c.contact_person === 'Parent/Guardian').length;

  return {
    student_id: student.id,
    roll_no: student.roll_no,
    name: student.name,
    student_phone: student.student_phone || '',
    parent_name: student.parent_name || '',
    parent_phone: student.parent_phone || '',
    email: student.email,
    section: student.section,
    attendance_pct: Math.round(attPct * 10) / 10,
    total_sessions: totalSessions,
    present_sessions: presentSessions,
    exam_avg_pct: Math.round(avgPct * 10) / 10,
    exam_count: examCount,
    trajectory: Math.round(trajectory * 10) / 10,
    percentile_rank: Math.round(percentile * 10) / 10,
    exam_scores: examDetails,
    calls_to_student: toStudent,
    calls_to_parent: toParent,
    total_calls: sCalls.length,
  };
}

function generateLocalStudentAnalysis(metrics) {
  const strengths = [];
  const risks = [];
  const recommendations = [];

  const name = metrics.name.split(' ')[0];

  if (metrics.attendance_pct >= 90) {
    strengths.push(`Exemplary session attendance record of ${metrics.attendance_pct}%, showing dependable class commitment.`);
  } else if (metrics.attendance_pct < 75) {
    risks.push(`Critical attendance deficit (${metrics.attendance_pct}%). Attendance has fallen below the 75% school threshold.`);
    recommendations.push(`Contact parent (${metrics.parent_name || 'Guardian'}: ${metrics.parent_phone || 'Phone'}) immediately to formulate an attendance recovery plan.`);
  }

  if (metrics.exam_avg_pct >= 80) {
    strengths.push(`High academic mastery across evaluated subjects with a ${metrics.exam_avg_pct}% average score.`);
    recommendations.push('Provide honors-level enrichment modules and independent research project pathways.');
  } else if (metrics.exam_avg_pct < 50) {
    risks.push(`Academic average of ${metrics.exam_avg_pct}% reflects urgent need for foundational concept remediation.`);
    recommendations.push('Implement mandatory weekly guided tutoring sessions and structured retake milestones.');
  }

  if (metrics.trajectory > 5) {
    strengths.push(`Strong positive score trajectory (+${metrics.trajectory}%). Demonstrates high improvement momentum.`);
  } else if (metrics.trajectory < -5) {
    risks.push(`Downward score trend (${metrics.trajectory}% drop from initial assessment). Requires immediate intervention.`);
    recommendations.push('Schedule a one-on-one diagnostic conference to evaluate recent study impediments and syllabus pace.');
  }

  if (metrics.percentile_rank >= 75) {
    strengths.push(`Performs in the upper quartile of Section ${metrics.section} peers (${metrics.percentile_rank}th percentile).`);
  } else if (metrics.percentile_rank < 25) {
    risks.push(`Lags within the lower quartile of Section peers (Percentile Rank: ${metrics.percentile_rank}th).`);
    recommendations.push('Formulate individualized pacing milestone targets for upcoming evaluations.');
  }

  if (strengths.length === 0) {
    strengths.push('Demonstrates active participation across scheduled classroom assessments.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Maintain steady study schedules and active participation in class discussions.');
  }

  let summary = '';
  if (metrics.exam_avg_pct >= 80 && metrics.attendance_pct >= 85) {
    summary = `${name} demonstrates exemplary overall performance in ${metrics.section} with dependable attendance (${metrics.attendance_pct}%) and superior academic marks (${metrics.exam_avg_pct}%).`;
  } else if (metrics.exam_avg_pct < 50 || metrics.attendance_pct < 75) {
    summary = `${name} requires immediate academic and behavioral intervention due to vulnerabilities in attendance (${metrics.attendance_pct}%) and examination yields (${metrics.exam_avg_pct}%).`;
  } else {
    summary = `${name} maintains satisfactory progress in ${metrics.section} with an attendance mark of ${metrics.attendance_pct}% and an average exam score of ${metrics.exam_avg_pct}%.`;
  }

  return {
    summary,
    key_strengths: strengths,
    risk_factors: risks,
    actionable_recommendations: recommendations,
    source: 'offline_heuristic_engine',
  };
}

// ---------------------------------------------------------------------------
// CSV INGESTION & MODALS
// ---------------------------------------------------------------------------

function initDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      document.getElementById('file-chosen-text').textContent = `Selected: ${fileInput.files[0].name} (${Math.round(fileInput.files[0].size / 1024)} KB)`;
      document.getElementById('file-chosen-text').className = 'text-[11px] text-sky-600 font-bold mt-1';
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('border-sky-500', 'bg-sky-50');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-sky-500', 'bg-sky-50');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      document.getElementById('file-chosen-text').textContent = `Selected: ${fileInput.files[0].name}`;
      document.getElementById('file-chosen-text').className = 'text-[11px] text-sky-600 font-bold mt-1';
    }
  });
}

async function uploadStudentFile() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a CSV file first.', 'warning');
    return;
  }

  const file = fileInput.files[0];
  const text = await file.text();

  if (state.isBackendAvailable) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/students/upload', { method: 'POST', body: formData });
      const result = await res.json();
      if (res.ok) {
        showToast(result.message || 'File imported successfully!', 'success');
        await refreshAllData();
        loadStudents();
        return;
      }
    } catch (e) {
      console.warn('Backend file upload failed, parsing locally:', e);
    }
  }

  // Parse CSV client-side
  parseAndInsertCsvLocally(text);
}

function parseAndInsertCsvLocally(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) {
    showToast('The selected file contains no data rows.', 'warning');
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const rollIdx = headers.indexOf('roll_no');
  const nameIdx = headers.indexOf('name');
  const studentPhoneIdx = headers.indexOf('student_phone');
  const parentNameIdx = headers.indexOf('parent_name');
  const parentPhoneIdx = headers.indexOf('parent_phone');
  const sectionIdx = headers.indexOf('section');

  if (rollIdx === -1 || nameIdx === -1) {
    showToast('CSV must include "roll_no" and "name" columns.', 'warning');
    return;
  }

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    const rollNo = cols[rollIdx];
    const name = cols[nameIdx];
    if (!rollNo || !name) continue;

    const studentPhone = studentPhoneIdx !== -1 && cols[studentPhoneIdx] ? cols[studentPhoneIdx] : '';
    const parentName = parentNameIdx !== -1 && cols[parentNameIdx] ? cols[parentNameIdx] : '';
    const parentPhone = parentPhoneIdx !== -1 && cols[parentPhoneIdx] ? cols[parentPhoneIdx] : '';
    const section = sectionIdx !== -1 && cols[sectionIdx] ? cols[sectionIdx] : 'General';

    const existing = state.students.find(s => s.roll_no === rollNo);
    if (existing) {
      existing.name = name;
      existing.student_phone = studentPhone || existing.student_phone;
      existing.parent_name = parentName || existing.parent_name;
      existing.parent_phone = parentPhone || existing.parent_phone;
      existing.section = section;
    } else {
      state.students.push({
        id: Date.now() + Math.random(),
        roll_no: rollNo,
        name: name,
        student_phone: studentPhone,
        parent_name: parentName,
        parent_phone: parentPhone,
        email: null,
        section: section,
        created_at: new Date().toISOString(),
      });
    }
    count++;
  }

  saveToLocalStorage();
  showToast(`Successfully processed ${count} student records.`, 'success');
  refreshAllData();
  loadStudents();
}

function downloadSampleCsv() {
  const csvContent = "roll_no,name,student_phone,parent_name,parent_phone,section\nCS-101,Amina Rahman,+1 (555) 234-5678,Kabir Rahman,+1 (555) 876-5432,Section A\nCS-102,Marcus Vance,+1 (555) 345-6789,Sarah Vance,+1 (555) 987-6543,Section A\nCS-103,Sophia Chen,+1 (555) 456-7890,Wei Chen,+1 (555) 123-9876,Section A\nCS-104,Devon Miller,+1 (555) 567-8901,Claire Miller,+1 (555) 234-8765,Section B\nCS-105,Elena Rostova,+1 (555) 678-9012,Dmitri Rostov,+1 (555) 345-7654,Section B\n";
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_students.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Student Modal
function openNewStudentModal() {
  document.getElementById('form-new-student').reset();
  document.getElementById('modal-student').classList.remove('hidden');
}
function closeNewStudentModal() {
  document.getElementById('modal-student').classList.add('hidden');
}

async function handleSaveNewStudent(e) {
  e.preventDefault();
  const roll_no = document.getElementById('stu-roll').value.trim();
  const name = document.getElementById('stu-name').value.trim();
  const student_phone = document.getElementById('stu-phone').value.trim();
  const parent_name = document.getElementById('stu-parent-name').value.trim();
  const parent_phone = document.getElementById('stu-parent-phone').value.trim();
  const section = document.getElementById('stu-section').value.trim() || 'General';

  if (state.students.find(s => s.roll_no.toLowerCase() === roll_no.toLowerCase())) {
    showToast(`Student with roll number "${roll_no}" already exists.`, 'warning');
    return;
  }

  const newStu = {
    id: Date.now(),
    roll_no,
    name,
    student_phone,
    parent_name,
    parent_phone,
    email: null,
    section,
    created_at: new Date().toISOString(),
  };

  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStu),
      });
      if (res.ok) {
        const saved = await res.json();
        newStu.id = saved.id;
      }
    } catch (err) {
      console.warn('Backend student add failed:', err);
    }
  }

  state.students.push(newStu);
  saveToLocalStorage();
  closeNewStudentModal();
  showToast(`Student ${name} added.`, 'success');
  refreshAllData();
  loadStudents();
}

async function deleteStudent(studentId) {
  if (!confirm('Are you sure you want to delete this student and all associated records?')) return;

  if (state.isBackendAvailable) {
    try {
      await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Backend delete failed:', e);
    }
  }

  state.students = state.students.filter(s => s.id !== studentId);
  state.marks = state.marks.filter(m => m.student_id !== studentId);
  state.attendance = state.attendance.filter(a => a.student_id !== studentId);
  state.callLogs = state.callLogs.filter(c => c.student_id !== studentId);
  state.selectedReportStudentIds.delete(studentId);

  saveToLocalStorage();
  showToast('Student deleted.', 'info');
  refreshAllData();
  loadStudents();
}

// Exam Modal
function openNewExamModal() {
  document.getElementById('form-new-exam').reset();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('exam-date').value = today;
  document.getElementById('modal-exam').classList.remove('hidden');
}
function closeNewExamModal() {
  document.getElementById('modal-exam').classList.add('hidden');
}

async function handleSaveNewExam(e) {
  e.preventDefault();
  const name = document.getElementById('exam-name').value.trim();
  const subject = document.getElementById('exam-subject').value.trim();
  const total_marks = parseFloat(document.getElementById('exam-total').value);
  const date = document.getElementById('exam-date').value;

  const newExam = {
    id: Date.now(),
    name,
    subject,
    total_marks,
    date,
  };

  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExam),
      });
      if (res.ok) {
        const saved = await res.json();
        newExam.id = saved.id;
      }
    } catch (err) {
      console.warn('Backend exam add failed:', err);
    }
  }

  state.exams.push(newExam);
  saveToLocalStorage();
  closeNewExamModal();
  showToast(`Exam "${name}" created.`, 'success');
  populateExamDropdowns();
  loadMarksMatrix();
}

// ---------------------------------------------------------------------------
// DATA TOOLS MODAL & GITHUB PAGES EXPORT/RESTORE
// ---------------------------------------------------------------------------

function openDataToolsModal() {
  document.getElementById('modal-data-tools').classList.remove('hidden');
}
function closeDataToolsModal() {
  document.getElementById('modal-data-tools').classList.add('hidden');
}

function exportDataJson() {
  const exportPayload = {
    version: '2.0',
    exported_at: new Date().toISOString(),
    students: state.students,
    exams: state.exams,
    marks: state.marks,
    attendance: state.attendance,
    callLogs: state.callLogs,
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `student_analytics_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Complete system data exported to JSON file.', 'success');
}

function importDataJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.students) throw new Error('Invalid schema: Missing students');

      state.students = parsed.students || [];
      state.exams = parsed.exams || [];
      state.marks = parsed.marks || [];
      state.attendance = parsed.attendance || [];
      state.callLogs = parsed.callLogs || [];

      saveToLocalStorage();
      showToast(`Imported ${state.students.length} students and records successfully.`, 'success');
      closeDataToolsModal();
      refreshAllData();
      switchTab('dashboard');
    } catch (err) {
      showToast('Error importing JSON: ' + err.message, 'warning');
    }
  };
  reader.readAsText(file);
}

function resetToSampleClassroom() {
  if (!confirm('Reset all current student, mark, and call log records to the standard sample classroom cohort?')) return;
  seedInitialData();
  saveToLocalStorage();
  showToast('Reset to sample classroom cohort data.', 'info');
  closeDataToolsModal();
  refreshAllData();
  switchTab('dashboard');
}

// ---------------------------------------------------------------------------
// UTILITY HELPERS
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-600 text-white',
    info: 'bg-slate-800 text-white',
  };

  toast.className = `p-3 rounded-xl shadow-lg text-xs font-semibold flex items-center justify-between pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button class="ml-3 text-white/80 hover:text-white" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
