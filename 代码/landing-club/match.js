// Character n-gram TF-IDF nearest-example classifier. No remote model or network request.
const stop=new Set("怎么 哪里 可以 学校 伦敦 校园 刚来 来伦 刚来伦 来伦敦 去哪 到校 到校园 入口 地方 一个 么查 怎么查 需要 什么 想找 在哪 在哪里".split(" "));
function grams(text){
 const words=text.toLowerCase().match(/[a-z]+|[\u3400-\u9fff]+/g)||[],out=[];
 for(const w of words){if(/^[a-z]/.test(w)){out.push(w);continue}
 for(const k of [2,3]) for(let i=0;i<=w.length-k;i++)out.push(w.slice(i,i+k))}
 return new Set(out.filter(g=>!stop.has(g)))
}
const corpus=Object.entries(topics).flatMap(([id,t])=>t.samples.map(s=>({id,vec:grams(s)})));
const df=new Map();for(const {vec} of corpus)for(const g of vec)df.set(g,(df.get(g)||0)+1);
const weight=g=>Math.log(1+(corpus.length+1)/((df.get(g)||0)+1))**2;
function predict(text){
 const q=grams(text);
 if(!q.size || /东京|巴黎|纽约|北京|曼彻斯特|签证|诊断|用药|签注/.test(text))return null;
 const qnorm=[...q].reduce((v,g)=>v+weight(g),0);
 const scores={};
 for(const {id,vec} of corpus){
 const shared=[...vec].filter(g=>q.has(g));
 const s=shared.reduce((v,g)=>v+weight(g),0)/Math.sqrt(qnorm*[...vec].reduce((v,g)=>v+weight(g),0));
 if(!scores[id]||scores[id].s<s)scores[id]={id,s,shared};
 }
 // Pool distinct evidence from the whole topic, so short cues in different examples reinforce one another.
 for(const [id,item] of Object.entries(scores)){
 const union=new Set(corpus.filter(d=>d.id===id).flatMap(d=>[...d.vec]));
 const evidence=[...q].filter(g=>union.has(g));
 item.s += 0.42*evidence.reduce((v,g)=>v+weight(g),0)/qnorm;
 item.shared=evidence;
 }
 const [best,next]=Object.values(scores).sort((a,b)=>b.s-a.s);
 return best.s>=0.075 && best.s-next.s>=0.018 ? best:null;
}
