import { chromium } from 'playwright';
const B='http://localhost:43200/dashboard/tracker'; const OUT='/workspace/jobber-shots';
const tg={dark:{bg_color:'#212121',secondary_bg_color:'#0f0f0f',text_color:'#ffffff',hint_color:'#aaaaaa',button_color:'#8774e1',button_text_color:'#ffffff'},light:{bg_color:'#ffffff',secondary_bg_color:'#f0f0f4',text_color:'#000000',hint_color:'#8e8e93',button_color:'#2481cc',button_text_color:'#ffffff'}};
const b=await chromium.launch();
for (const s of ['light','dark']) {
  let ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:s,isMobile:true,hasTouch:true});
  let p=await ctx.newPage();
  await p.goto(B+'#tgWebAppPlatform=ios&tgWebAppVersion=8.0&tgWebAppThemeParams='+encodeURIComponent(JSON.stringify(tg[s])),{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  await p.screenshot({path:`${OUT}/tr-mobile-${s}.png`});
  await p.locator('ul li button').first().click(); await p.waitForTimeout(700);
  await p.screenshot({path:`${OUT}/tr-mobile-${s}-sheet.png`});
  await ctx.close();
  ctx=await b.newContext({viewport:{width:1440,height:900},colorScheme:s}); p=await ctx.newPage();
  await p.goto(B,{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  await p.screenshot({path:`${OUT}/tr-desktop-${s}.png`});
  await p.locator('ul li button').nth(2).click(); await p.waitForTimeout(700);
  await p.screenshot({path:`${OUT}/tr-desktop-${s}-sheet.png`});
  await ctx.close();
}
await b.close();
