import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { build } from 'vite';

const base=process.env.NACKCHAL_URL??'http://127.0.0.1:4185';
await mkdir('.qa',{recursive:true});
await build({configFile:false,logLevel:'error',build:{lib:{entry:'node_modules/react-scan/dist/lite/index.mjs',name:'scanLite',formats:['iife'],fileName:()=> 'scan-lite.js'},outDir:'.qa/scan'}});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--remote-debugging-port=9238']});
const reports=[];
try {
  const context=await browser.newContext();
  await context.addInitScript({path:'.qa/scan/scan-lite.js'});
  await context.addInitScript(()=>{
    window.renderEvents=[];
    window.scanLite.instrument({onEvent:event=>{if(event.kind==='commit')window.renderEvents.push(event);},recordChangeDescriptions:true});
  });
  const page=await context.newPage();
  await page.goto(base);
  await page.getByLabel('이메일', { exact: true }).waitFor();
  const renderData=await page.evaluate(()=>({count:window.renderEvents.length,unnecessary:window.renderEvents.filter(event=>event.tree?.some(node=>node.changeDescription?.kind==='unnecessary')).length}));
  await writeFile('.qa/render-report.json',JSON.stringify(renderData,null,2));
  await context.close();
  for(const formFactor of (process.argv.includes('--desktop-only') ? ['desktop'] : ['mobile','desktop'])) {
    for(let run=1;run<=3;run++) {
      const result=await lighthouse(base,{port:9238,logLevel:'error',output:'json',onlyCategories:['performance','accessibility','best-practices','seo'],formFactor,screenEmulation:formFactor==='desktop'?{mobile:false,width:1280,height:900,deviceScaleFactor:1,disabled:false}:{mobile:true,width:375,height:812,deviceScaleFactor:1,disabled:false}},formFactor==='desktop'?desktopConfig:undefined);
      if(!result)throw new Error('Lighthouse returned no report');
      const scores=Object.fromEntries(Object.entries(result.lhr.categories).map(([key,value])=>[key,Math.round((value.score??0)*100)]));
      const failures=Object.values(result.lhr.audits).filter(audit=>audit.score!==null&&audit.score<1).map(audit=>({id:audit.id,title:audit.title,score:audit.score,numericValue:audit.numericValue,displayValue:audit.displayValue,details:audit.details}));
      reports.push({formFactor,run,scores,failures});
      console.log(JSON.stringify({formFactor,run,scores}));
      await writeFile('.qa/performance-report.json',JSON.stringify(reports,null,2));
    }
  }
} finally { await browser.close(); }
