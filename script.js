const $=id=>document.getElementById(id);

const titles={dashboard:['Dashboard',"Here's what's happening with your classes."],assignments:['Assignments','Keep everything in one place.'],grades:['Grades','See your current class averages.'],classes:['Classes','Your current schedule.'],calendar:['Calendar','See upcoming deadlines.'],settings:['Settings','Customize your dashboard.']};

function formatDate(value){const d=new Date(value+'T12:00:00');return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function escapeHtml(s){return String(s).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}

// Schoology data is loaded only from an authorized API connection.
let schoologyData=null;

function assignmentHTML(a){return `<div class="assignment-row"><div class="assignment-icon">•</div><div class="assignment-info"><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.course)} · ${formatDate(a.date)}</span></div><span class="badge ${a.status}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></div>`}

function renderDashboard(){
 const d=schoologyData;
 $('overallGrade').textContent=d?.overallGrade ?? '—';
 $('missingCount').textContent=d?.missingCount ?? '—';
 $('dueSoonCount').textContent=d?.dueSoonCount ?? '—';
 $('classCount').textContent=d?.classes?.length ?? '—';
 $('todayDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
 if(!d){
  $('upcomingList').innerHTML='<div class="assignment-row"><div class="assignment-info"><strong>Connect Schoology to load assignments</strong><span>Your real assignments will appear here.</span></div></div>';
  $('gradeBars').innerHTML='<div class="assignment-row"><div class="assignment-info"><strong>Connect Schoology to load grades</strong><span>Your class averages will appear here.</span></div></div>';
  return;
 }
 const upcoming=(d.assignments||[]).slice(0,5);
 $('upcomingList').innerHTML=upcoming.length?upcoming.map(assignmentHTML).join(''):'<div class="assignment-row"><div class="assignment-info"><strong>No upcoming assignments</strong></div></div>';
 $('gradeBars').innerHTML=(d.grades||[]).map(g=>`<div class="grade-row"><span>${escapeHtml(g.course)}</span><strong>${escapeHtml(g.grade)}</strong></div>`).join('')||'<div class="assignment-row"><div class="assignment-info"><strong>No grades available yet</strong></div></div>';
}

function renderAssignments(){
 const list=schoologyData?.assignments||[];
 $('allAssignments').innerHTML=list.length?list.map(assignmentHTML).join(''):'<div class="assignment-row"><div class="assignment-info"><strong>Connect Schoology to load assignments</strong><span>Use Settings → Connect Schoology.</span></div></div>';
}
function renderGrades(){
 const list=schoologyData?.grades||[];
 $('gradesGrid').innerHTML=list.length?list.map(g=>`<div class="panel"><div class="assignment-info"><strong>${escapeHtml(g.course)}</strong><span>${escapeHtml(g.grade)}</span></div></div>`).join(''):'<div class="panel"><div class="assignment-info"><strong>Connect Schoology to load grades</strong><span>Grades will appear here after the authorized connection is completed.</span></div></div>';
}
function renderClasses(){
 const list=schoologyData?.classes||[];
 $('classGrid').innerHTML=list.length?list.map(c=>`<div class="panel"><div class="assignment-info"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.teacher||'')}</span></div></div>`).join(''):'<div class="panel"><div class="assignment-info"><strong>Connect Schoology to load classes</strong><span>Your current classes will appear here.</span></div></div>';
}

let calendarDate=new Date();
function renderCalendar(){
 const year=calendarDate.getFullYear(),month=calendarDate.getMonth();
 $('calendarMonth').textContent=calendarDate.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate(),prev=new Date(year,month,0).getDate();let html='';
 for(let i=0;i<first;i++)html+=`<div class="day muted">${prev-first+i+1}</div>`;
 for(let d=1;d<=days;d++){const today=new Date();const isToday=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();html+=`<div class="day ${isToday?'today':''}">${d}</div>`}
 const total=Math.ceil((first+days)/7)*7;for(let i=first+days;i<total;i++)html+=`<div class="day muted">${i-first-days+1}</div>`;
 $('calendar').innerHTML=html;
 const events=schoologyData?.events||[];
 $('calendarEvents').innerHTML=events.length?events.map(e=>`<div class="event"><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml(e.date||'')}</span></div>`).join(''):'<div class="event"><strong>Connect Schoology</strong><span>Your Schoology deadlines will appear here.</span></div>';
}

function showPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page-'+page).classList.add('active');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=titles[page][0];$('pageSubtitle').textContent=titles[page][1];if(page==='calendar')renderCalendar();if(page==='assignments')renderAssignments();if(page==='grades')renderGrades();if(page==='classes')renderClasses();if(window.innerWidth<901)$('sidebar').classList.remove('open')}

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));
$('assignmentFilter').addEventListener('change',renderAssignments);$('assignmentSearch').addEventListener('input',renderAssignments);
$('prevMonth').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()});$('nextMonth').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()});
$('menuButton').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
function setDark(on){document.body.classList.toggle('dark',on);$('darkModeToggle').checked=on;localStorage.setItem('schoologythingy-dark',on?'1':'0')}
$('darkModeToggle').addEventListener('change',e=>setDark(e.target.checked));$('themeButton').addEventListener('click',()=>setDark(!document.body.classList.contains('dark')));
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600)}
$('refreshButton').addEventListener('click',()=>{renderDashboard();renderAssignments();renderGrades();renderClasses();renderCalendar();toast(schoologyData?'Dashboard refreshed':'Connect Schoology first')});
$('connectButton').addEventListener('click',()=>{
 $('connectionStatus').textContent='Opening Schoology…';
 $('connectionDetail').textContent='Sign in through the official TSD Schoology page';
 window.location.assign('https://troyschools.schoology.com/');
});

setDark(localStorage.getItem('schoologythingy-dark')==='1');
renderDashboard();renderAssignments();renderGrades();renderClasses();renderCalendar();