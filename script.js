const $=id=>document.getElementById(id);

const titles={dashboard:['Dashboard',"Here's what's happening with your classes."],assignments:['Assignments','Keep everything in one place.'],grades:['Grades','See your current class averages.'],classes:['Classes','Your current schedule.'],calendar:['Calendar','See upcoming deadlines.'],settings:['Settings','Customize your dashboard.']};

function dateOffset(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function formatDate(value){const d=new Date(value+'T12:00:00');return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

// Sample data is intentionally kept only as a UI fallback. Real Schoology data
// must come through an authorized Schoology API/OAuth integration.
const classes=[];
const assignments=[];

function assignmentHTML(a){return `<div class="assignment-row"><div class="assignment-icon">•</div><div class="assignment-info"><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.course)} · ${formatDate(a.date)}</span></div><span class="badge ${a.status}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></div>`}

function renderDashboard(){
 $('overallGrade').textContent='—';$('missingCount').textContent='—';$('dueSoonCount').textContent='—';$('classCount').textContent='—';
 $('upcomingList').innerHTML='<div class="assignment-row"><div class="assignment-info"><strong>Connect Schoology to load assignments</strong><span>Your real assignments will appear here.</span></div></div>';
 $('gradeBars').innerHTML='<div class="assignment-row"><div class="assignment-info"><strong>Connect Schoology to load grades</strong><span>Your class averages will appear here.</span></div></div>';
 $('todayDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
}

function renderAssignments(){
 $('allAssignments').innerHTML='<div class="assignment-row"><div class="assignment-info"><strong>Connect Schoology to load assignments</strong><span>Use Settings → Connect Schoology.</span></div></div>';
}
function renderGrades(){$('gradesGrid').innerHTML='<div class="panel"><div class="assignment-info"><strong>Connect Schoology to load grades</strong><span>Grades will appear here after a real authorized integration is configured.</span></div></div>'}
function renderClasses(){$('classGrid').innerHTML='<div class="panel"><div class="assignment-info"><strong>Connect Schoology to load classes</strong><span>Your current classes will appear here.</span></div></div>'}

let calendarDate=new Date();
function renderCalendar(){
 const year=calendarDate.getFullYear(),month=calendarDate.getMonth();
 $('calendarMonth').textContent=calendarDate.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate(),prev=new Date(year,month,0).getDate();let html='';
 for(let i=0;i<first;i++)html+=`<div class="day muted">${prev-first+i+1}</div>`;
 for(let d=1;d<=days;d++){const today=new Date();const isToday=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();html+=`<div class="day ${isToday?'today':''}">${d}</div>`}
 const total=Math.ceil((first+days)/7)*7;for(let i=first+days;i<total;i++)html+=`<div class="day muted">${i-first-days+1}</div>`;
 $('calendar').innerHTML=html;
 $('calendarEvents').innerHTML='<div class="event"><strong>Connect Schoology</strong><span>Your Schoology deadlines will appear here.</span></div>';
}

function showPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page-'+page).classList.add('active');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=titles[page][0];$('pageSubtitle').textContent=titles[page][1];if(page==='calendar')renderCalendar();if(page==='assignments')renderAssignments();if(window.innerWidth<901)$('sidebar').classList.remove('open')}

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));
$('assignmentFilter').addEventListener('change',renderAssignments);$('assignmentSearch').addEventListener('input',renderAssignments);
$('prevMonth').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()});$('nextMonth').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()});
$('menuButton').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
function setDark(on){document.body.classList.toggle('dark',on);$('darkModeToggle').checked=on;localStorage.setItem('schoologythingy-dark',on?'1':'0')}
$('darkModeToggle').addEventListener('change',e=>setDark(e.target.checked));$('themeButton').addEventListener('click',()=>setDark(!document.body.classList.contains('dark')));
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600)}
$('refreshButton').addEventListener('click',()=>{renderDashboard();renderAssignments();toast('Dashboard refreshed')});
$('connectButton').addEventListener('click',()=>{
  $('connectionStatus').textContent='Opening Schoology…';
  $('connectionDetail').textContent='Use the official TSD sign-in page';
  window.location.assign('https://troyschools.schoology.com/');
});
setDark(localStorage.getItem('schoologythingy-dark')==='1');renderDashboard();renderAssignments();renderGrades();renderClasses();renderCalendar();