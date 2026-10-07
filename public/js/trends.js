let trendHistory=[];
async function loadTrendHistory(){
 trendHistory=await api.get('/api/transactions/list?maxCount=-1');
 const yearControl=document.getElementById('trendYear');const previous=yearControl.value;
 const years=[...new Set(trendHistory.map(t=>t.date.slice(0,4)))].sort();
 yearControl.innerHTML='<option value="all">All years</option>'+years.map(y=>`<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
 yearControl.value=years.includes(previous)?previous:'all';
 const categoryControl=document.getElementById('trendCategory');const category=categoryControl.value;
 const categories=[...new Set(trendHistory.filter(t=>t.amount>0).map(t=>t.category))].sort();
 categoryControl.innerHTML='<option value="all">All expenses</option>'+categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(formatCategory(c))}</option>`).join('');
 categoryControl.value=categories.includes(category)?category:'all';
 setText('syntheticNotice',trendHistory.some(t=>t.id.startsWith('synthetic-'))?'Synthetic demo · Includes simulated future months through Dec 2026':'Stored transaction history');
 renderTrends();
}
function renderTrends(){
 const year=document.getElementById('trendYear').value;
 const category=document.getElementById('trendCategory').value;
 const period=trendHistory.filter(t=>year==='all'||t.date.startsWith(year));
 const currency=period[0]?.currency_code||'USD';
 const selected=period.filter(t=>(t.currency_code||'USD')===currency&&(t.amount<0||category==='all'||t.category===category));
 renderOverview(selected);
 if(category!=="all") { const labels=document.querySelectorAll("#overviewMetrics .metric-label"); labels[0].textContent=formatCategory(category)+" outflows"; labels[2].textContent="Income less selected category"; }
 const years=[...new Set(period.map(t=>t.date.slice(0,4)))].sort();
 const months={};years.forEach(y=>{for(let m=1;m<=12;m++)months[`${y}-${String(m).padStart(2,'0')}`]={income:0,expense:0}});
 selected.forEach(t=>{const month=t.date.slice(0,7);if(months[month])months[month][t.amount<0?'income':'expense']+=Math.abs(t.amount)});
 const max=Math.max(1,...Object.values(months).flatMap(m=>[m.income,m.expense]));
 const money=v=>formatCurrency(v,currency);
 setHTML('monthlyTrends',Object.entries(months).map(([month,v])=>`<div class="month-group"><div class="month-columns"><div class="income-column" style="height:${v.income/max*100}%" title="${month} income: ${escapeHtml(money(v.income))}"></div><div class="expense-column" style="height:${v.expense/max*100}%" title="${month} expenses: ${escapeHtml(money(v.expense))}"></div></div><span>${month.slice(5)}/${month.slice(2,4)}</span><span class="visually-hidden">${escapeHtml(money(v.income))} income, ${escapeHtml(money(v.expense))} expenses</span></div>`).join(''));
 const seasons={Winter:0,Spring:0,Summer:0,Fall:0};
 Object.entries(months).forEach(([month,v])=>{const m=Number(month.slice(5));seasons[[12,1,2].includes(m)?'Winter':m<=5?'Spring':m<=8?'Summer':'Fall']+=v.expense});
 const ranked=Object.entries(seasons).sort((a,b)=>b[1]-a[1]);
 const scope=category==='all'?'All expenses':formatCategory(category);
 setText('seasonInsight',selected.length?`${scope} · ${ranked.map(([s,v])=>`${s}: ${money(v)}`).join(' · ')}. ${ranked[0][1]>0?ranked[0][0]+' has the highest recorded spending.':'No spending in this selection.'} Seasons use calendar months (winter: Dec–Feb).`:'No transactions in this selection.');
}
document.getElementById('trendYear').addEventListener('change',renderTrends);
document.getElementById('trendCategory').addEventListener('change',renderTrends);
