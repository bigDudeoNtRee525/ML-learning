#!/usr/bin/env node
/* Assemble the ML curriculum: shell_top + modules (codeblocks escaped) + shell_bottom */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;                                  // build/ folder (this script lives here)
const OUT = path.join(__dirname, '..', 'ml-curriculum.html'); // write the assembled page to repo root
const ORDER = ['m0','m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14','m15','projects'];

function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Pull just the <section>…</section>, dropping any stray wrappers/fences an agent might have added.
function extractSection(html){
  let s = html;
  // strip leading markdown code fences like ```html
  s = s.replace(/^﻿?\s*```[a-zA-Z]*\s*\n/,'').replace(/\n```\s*$/,'');
  const start = s.indexOf('<section');
  const end = s.lastIndexOf('</section>');
  if(start !== -1 && end !== -1) s = s.slice(start, end + '</section>'.length);
  return s.trim();
}

function transformCode(html){
  // 1) <codeblock ...>RAW</codeblock>  ->  escaped <pre><code class="language-python">
  html = html.replace(/<codeblock[^>]*>([\s\S]*?)<\/codeblock>/gi, (m, code) => {
    let c = code.replace(/^\n/,'').replace(/\s+$/,'');
    return '<pre><code class="language-python">' + esc(c) + '</code></pre>';
  });
  // 2) safety net: stray ```python fenced blocks -> same treatment
  html = html.replace(/```(?:python|py)?\s*\n([\s\S]*?)```/g, (m, code) => {
    return '<pre><code class="language-python">' + esc(code.replace(/\s+$/,'')) + '</code></pre>';
  });
  return html;
}

const issues = [];
const top = fs.readFileSync(path.join(DIR,'_shell_top.html'),'utf8');
const bottom = fs.readFileSync(path.join(DIR,'_shell_bottom.html'),'utf8');

let body = '';
const required = ['done-box','class="boss"','class="recall"','class="predict"'];
for(const id of ORDER){
  const fp = path.join(DIR, id + '.html');
  if(!fs.existsSync(fp)){ issues.push('MISSING FILE: ' + id + '.html'); continue; }
  let raw = fs.readFileSync(fp,'utf8');
  let sec = extractSection(raw);
  // validation (pre-transform, on the section text)
  const nSec = (sec.match(/<section\b/gi)||[]).length;
  if(nSec !== 1) issues.push(id + ': expected 1 <section>, found ' + nSec);
  if(sec.indexOf('id="'+id+'"') === -1 && sec.indexOf("id='"+id+"'") === -1) issues.push(id + ': section id mismatch (expected id="'+id+'")');
  if(id !== 'projects'){
    for(const r of required){ if(sec.indexOf(r) === -1) issues.push(id + ': missing marker "'+r+'"'); }
  }
  sec = transformCode(sec);
  // post-transform leftovers
  if(/<codeblock/i.test(sec)) issues.push(id + ': leftover <codeblock> after transform');
  if(/```/.test(sec)) issues.push(id + ': leftover ``` fence');
  // crude check: any raw "<" inside a <pre><code> that is not an entity (post-transform should be clean)
  const codeBlocks = sec.match(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g) || [];
  codeBlocks.forEach((cb,i)=>{
    const inner = cb.replace(/^<pre><code[^>]*>/,'').replace(/<\/code><\/pre>$/,'');
    if(/<(?!\/?(?:span|br)\b)[a-zA-Z\/]/.test(inner)) issues.push(id + ': possible unescaped HTML tag inside code block #'+(i+1));
  });
  body += '\n<!-- ===== ' + id + ' ===== -->\n' + sec + '\n';
}

// ---- inject interactive widget scripts ----
const WIDGET_DIR = path.join(DIR, 'widgets');
let widgetScript = '';
let widgetNames = [];
if(fs.existsSync(WIDGET_DIR)){
  const files = fs.readdirSync(WIDGET_DIR).filter(f => f.endsWith('.js')).sort();
  for(const f of files){
    const js = fs.readFileSync(path.join(WIDGET_DIR, f), 'utf8');
    // build-time syntax gate so a broken widget is caught here, not in the browser
    try{ new Function(js); }catch(e){ issues.push(f + ': JS syntax error — ' + e.message); }
    (js.match(/MLViz\.register\(\s*['"]([^'"]+)['"]/g) || []).forEach(m => {
      widgetNames.push(m.replace(/MLViz\.register\(\s*['"]/, '').replace(/['"]$/, ''));
    });
    // each widget in its OWN <script> so a failure can't take down the others
    widgetScript += '\n<script>\n/* widget file: ' + f + ' */\n' + js + '\n</script>\n';
  }
}
let assembled = top + body + bottom;
if(widgetScript){
  assembled = assembled.replace('<!--WIDGET-SCRIPTS-->', widgetScript);
}
// cross-check: every mount point has a registered widget, and vice-versa
const mountNames = Array.from(new Set((assembled.match(/data-widget="([^"]+)"/g) || []).map(m => m.replace(/data-widget="/, '').replace(/"$/, ''))));
const regSet = new Set(widgetNames);
mountNames.forEach(n => { if(!regSet.has(n)) issues.push('widget mount "' + n + '" has no registered implementation'); });
widgetNames.forEach(n => { if(!mountNames.includes(n)) issues.push('widget "' + n + '" is defined but never mounted'); });

const finalHtml = assembled;
fs.writeFileSync(OUT, finalHtml, 'utf8');

// ---- report ----
const kb = (Buffer.byteLength(finalHtml,'utf8')/1024).toFixed(1);
console.log('Wrote ' + OUT + ' (' + kb + ' KB)');
console.log('Modules assembled: ' + ORDER.filter(id=>fs.existsSync(path.join(DIR,id+'.html'))).length + '/' + ORDER.length);
const codeCount = (finalHtml.match(/<pre><code/g)||[]).length;
console.log('Code blocks: ' + codeCount);
const exCount = (finalHtml.match(/<details class="solution"/g)||[]).length;
console.log('Exercise solutions: ' + exCount);
const svgCount = (finalHtml.match(/<svg/g)||[]).length;
console.log('Inline SVG diagrams: ' + svgCount);
console.log('Companion callouts: ' + (finalHtml.match(/callout companion/g)||[]).length);
console.log('Interactive widgets: ' + widgetNames.length + ' defined, ' + mountNames.length + ' mounted' + (widgetNames.length ? ' [' + widgetNames.sort().join(', ') + ']' : ''));
console.log('Active mechanics: ' + (finalHtml.match(/class="predict"/g)||[]).length + ' predict cards, ' +
  (finalHtml.match(/class="recall"/g)||[]).length + ' recall decks, ' +
  (finalHtml.match(/<li/g)&&(finalHtml.match(/ul class="missions"/g)||[]).length) + ' mission lists, ' +
  (finalHtml.match(/class="boss"/g)||[]).length + ' boss fights, ' +
  (finalHtml.match(/class="callback"/g)||[]).length + ' callbacks, ' +
  (finalHtml.match(/details class="spoiler"/g)||[]).length + ' debug/spoilers');
if(issues.length){
  console.log('\n*** ' + issues.length + ' ISSUE(S) ***');
  issues.forEach(x=>console.log('  - ' + x));
} else {
  console.log('\nNo structural issues detected. ✓');
}
