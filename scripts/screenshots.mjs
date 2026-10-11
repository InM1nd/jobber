// Visual check: run `npm run build && npx next start -p 43200` in DEMO_MODE (make sure no older server holds the port), then `node scripts/screenshots.mjs` with playwright installed. Exits non-zero if any stylesheet fails to load.
import { chromium } from 'playwright';
const B='http://localhost:43200'; const OUT='/workspace/jobber-shots';
const dark={bg_color:'#212121',secondary_bg_color:'#0f0f0f',section_bg_color:'#1c1c1d',text_color:'#ffffff',hint_color:'#aaaaaa',link_color:'#8774e1',button_color:'#8774e1',button_text_color:'#ffffff'};
const light={bg_color:'#ffffff',secondary_bg_color:'#f0f0f4',section_bg_color:'#ffffff',text_color:'#000000',hint_color:'#8e8e93',link_color:'#2481cc',button_color:'#2481cc',button_text_color:'#ffffff'};
const hash=(t)=>'#tgWebAppPlatform=ios&tgWebAppVersion=8.0&tgWebAppThemeParams='+encodeURIComponent(JSON.stringify(t));
const b=await chromium.launch();
for (const [name,t] of [['dark',dark],['light',light]]) {
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:name, isMobile:true, hasTouch:true});
  const p=await ctx.newPage(); p.on('response',r=>{if(r.url().endsWith('.css')&&r.status()!==200){console.error('CSS FAIL',r.url(),r.status());process.exit(1)}});
  for (const [file,path] of [['matches-empty','/dashboard/matches?view=empty'],['matches','/dashboard/matches'],['match-detail','/dashboard/matches/m1'],['tracker','/dashboard/tracker'],['profile','/dashboard/profile'],['settings','/dashboard/settings']]) {
    await p.goto(B+path+hash(t),{waitUntil:'networkidle'}); await p.waitForTimeout(1300);
    await p.screenshot({path:`${OUT}/miniapp-${name}-${file}.png`, fullPage: false});
  }
  await ctx.close();
}
for (const scheme of ['light','dark']) {
  const ctx=await b.newContext({viewport:{width:1440,height:900},colorScheme:scheme});
  const p=await ctx.newPage(); p.on('response',r=>{if(r.url().endsWith('.css')&&r.status()!==200){console.error('CSS FAIL',r.url(),r.status());process.exit(1)}});
  for (const [file,path] of [['landing','/'],['matches','/dashboard/matches']]) {
    await p.goto(B+path,{waitUntil:'networkidle'}); await p.waitForTimeout(1300);
    await p.screenshot({path:`${OUT}/web-${scheme}-${file}.png`});
  }
  await ctx.close();
}
await b.close();
