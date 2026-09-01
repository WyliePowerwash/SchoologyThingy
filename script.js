const classes=[
 {name:'Math',teacher:'Ms. Carter',grade:94,code:'MATH'},
 {name:'Science',teacher:'Mr. Wilson',grade:91,code:'SCI'},
 {name:'English',teacher:'Ms. Adams',grade:97,code:'ELA'},
 {name:'Social Studies',teacher:'Mr. Lee',grade:95,code:'SS'},
 {name:'Band',teacher:'Ms. Davis',grade:96,code:'BAND'},
 {name:'PE',teacher:'Coach Brown',grade:98,code:'PE'},
 {name:'Elective',teacher:'Ms. Taylor',grade:93,code:'ELEC'}
];

const assignments=[
 {title:'Algebra Practice',course:'Math',date:dateOffset(1),status:'upcoming'},
 {title:'Lab Questions',course:'Science',date:dateOffset(2),status:'upcoming'},
 {title:'Reading Response',course:'English',date:dateOffset(3),status:'upcoming'},
 {title:'Chapter 4 Notes',course:'Social Studies',date:dateOffset(5),status:'upcoming'},
 {title:'Instrument Practice Log',course:'Band',date:dateOffset(7),status:'upcoming'},
 {title:'Math Homework #12',course:'Math',date:dateOffset(-1),status:'missing'},
 {title:'Vocabulary Quiz',course:'English',date:dateOffset(-2),status:'missing'},
 {title:'Fitness Reflection',course:'PE',date:dateOffset(-3),status:'completed'},
 {title:'Science Warm-Up',course:'Science',date:dateOffset(-4),status:'completed'},
 {title:'Map Skills',course:'Social Studies',date:dateOffset(-5),status:'completed'}
];

function dateOffset(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function formatDate(value){const d=new Date(value+'T12:00:00');return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

const $=id=>document.getElementById(id);

function assignmentHTML(a){return `<div class="assignment-row"><div class="assignment-icon">${a.status==='completed'?'✓':a.status==='missing'?'!':'•'}</div><div class="assignment-info"><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.course)} · ${formatDate(a.date)}</span></div><span class="badge ${a.status}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></div>`}

function renderDashboard(){
 const missing=assignments.filter(a=>a.status==='missing').length;
 const due=assignments.filter(a=>a.status==='upcoming' && a.date<=dateOffset(7)).length;
 const overall=Math.round(classes.reduce((s,c)=>s+c.grade,0)/classes.length);
 $('overallGrade').textContent=overall+'%';$('missingCount').textContent=missing;$('dueSoonCount').textContent=due;$('classCount').textContent=classes.length;
 $('upcomingList').innerHTML=assignments.filter(a=>a.status!=='completed').slice(0,6).map(assignmentHTML).join('');
 $('gradeBars').innerHTML=classes.slice(0,6).map(c=>`<div class="grade-line"><span>${escapeHtml(c.name)}</span><div class="bar"><i style="width:${c.grade}%"></i></div><b>${c.grade}%</b></div>`).join('');
 $('todayDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
}

function renderAssignments(){
 const filter=$('assignmentFilter').value, search=$('assignmentSearch').value.toLowerCase();
 let list=assignments.filter(a=>(filter==='all'||a.status===filter)&&(`${a.title} ${a.course}`.toLowerCase().includes(search)));
 $('allAssignments').innerHTML=list.length?list.map(assignmentHTML).join(''):`<div class="assignment-row"><div class="assignment-info"><strong>No assignments found</strong><span>Try another filter or search.</span></div></div>`;
}

function renderGrades(){$('gradesGrid').innerHTML=classes.map(c=>`<div class="grade-card"><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.teacher)}</p><div class="grade-number">${c.grade}%</div><div class="bar"><i style="width:${c.grade}%"></i></div></div>`).join('')}
function renderClasses(){$('classGrid').innerHTML=classes.map(c=>`<div class="class-card"><div class="class-top"><h3>${escapeHtml(c.name)}</h3><span class="class-code">${escapeHtml(c.code)}</span></div><p>${escapeHtml(c.teacher)}</p><strong>${c.grade}% current grade</strong></div>`).join('')}

let calendarDate=new Date();
function renderCalendar(){
 const year=calendarDate.getFullYear(),month=calendarDate.getMonth();
 $('calendarMonth').textContent=calendarDate.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate(),prev=new Date(year,month,0).getDate();let html='';
 for(let i=0;i<first;i++)html+=`<div class="day muted">${prev-first+i+1}</div>`;
 for(let d=1;d<=days;d++){const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const today=new Date();const isToday=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();const event=assignments.some(a=>a.date===key);html+=`<div class="day ${isToday?'today':''} ${event?'has-event':''}">${d}</div>`}
 const total=Math.ceil((first+days)/7)*7;for(let i=first+days;i<total;i++)html+=`<div class="day muted">${i-first-days+1}</div>`;$('calendar').innerHTML=html;
 const upcoming=assignments.filter(a=>a.status==='upcoming').sort((a,b)=>a.date.localeCompare(b.date)).slice(0,7);$('calendarEvents').innerHTML=upcoming.map(a=>`<div class="event"><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.course)} · ${formatDate(a.date)}</span></div>`).join('');
}

const titles={dashboard:['Dashboard',"Here's what's happening with your classes."],assignments:['Assignments','Keep everything in one place.'],grades:['Grades','See your current class averages.'],classes:['Classes','Your current schedule.'],calendar:['Calendar','See upcoming deadlines.'],settings:['Settings','Customize your dashboard.']};
function showPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page-'+page).classList.add('active');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=titles[page][0];$('pageSubtitle').textContent=titles[page][1];if(page==='calendar')renderCalendar();if(page==='assignments')renderAssignments();if(window.innerWidth<901)$('sidebar').classList.remove('open')}

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));
$('assignmentFilter').addEventListener('change',renderAssignments);$('assignmentSearch').addEventListener('input',renderAssignments);
$('prevMonth').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()});$('nextMonth').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()});
$('menuButton').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
function setDark(on){document.body.classList.toggle('dark',on);$('darkModeToggle').checked=on;localStorage.setItem('schoologythingy-dark',on?'1':'0')}
$('darkModeToggle').addEventListener('change',e=>setDark(e.target.checked));$('themeButton').addEventListener('click',()=>setDark(!document.body.classList.contains('dark')));
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2200)}
$('refreshButton').addEventListener('click',()=>{renderDashboard();renderAssignments();toast('Dashboard refreshed')});
$('connectButton').addEventListener('click',()=>{window.location.href='https://app.schoology.com/login';});
$('resetButton').addEventListener('click',()=>{renderDashboard();renderAssignments();renderGrades();renderClasses();renderCalendar();toast('Demo data reset')});
setDark(localStorage.getItem('schoologythingy-dark')==='1');renderDashboard();renderAssignments();renderGrades();renderClasses();renderCalendar();