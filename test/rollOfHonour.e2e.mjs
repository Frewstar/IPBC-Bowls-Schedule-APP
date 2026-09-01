// ════════════════════════════════════════════════════════════════════════════
//  Roll of Honour — reading one season across the board
//
//  68 seasons are on record in production, 1958 to 2026, and the only way to
//  read 1975 was to open every competition in turn. A Season dropdown picks a
//  year and lists who won what.
//
//  Driven against the real shape of roll_of_honour.winners — [{year, winner}] —
//  with a representative slice of the live rows, including a competition with
//  no winners at all.
//
//  Run:  npx vite build && node test/rollOfHonour.e2e.mjs
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const DIST=path.resolve("dist"), PORT=4371;
const ROH=JSON.parse(fs.readFileSync(path.resolve("test/fixtures-roll-of-honour.json"),"utf8"));
const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const srv=http.createServer((q,r)=>{const u=q.url.split("?")[0];let f=path.join(DIST,u==="/"?"index.html":u);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(DIST,"index.html");
 r.writeHead(200,{"content-type":T[path.extname(f)]||"application/octet-stream"});r.end(fs.readFileSync(f));});
let fails=0; const check=(ok,m)=>{if(!ok)fails++;console.log(`  ${ok?"✓":"✗"} ${m}`);};
srv.listen(PORT, async()=>{
  const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage({viewport:{width:420,height:2600}});
  await p.route("**://fonts.g*/**", r=>r.abort());
  await p.route("**supabase.co**", r=>{const u=r.request().url();
    return r.fulfill({status:200,contentType:"application/json",
      body: u.includes("roll_of_honour")?JSON.stringify(ROH):"[]"});});
  await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
  await p.evaluate(()=>localStorage.setItem("ipbc_welcome_seen",JSON.stringify(true)));
  await p.reload({waitUntil:"domcontentloaded"}); await p.waitForTimeout(2200);
  await p.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(b=>(b.textContent||"").trim().toLowerCase()==="club"); if(x)x.click();});
  await p.waitForTimeout(1000);

  const sel = await p.$("#roh-year");
  check(!!sel, "a Season dropdown is on the Roll of Honour");
  const opts = await p.evaluate(()=>[...document.querySelectorAll("#roh-year option")].map(o=>o.textContent.trim()));
  console.log("      options:", opts.join(", "));
  check(opts[0]==="All years", "defaults to All years");
  for (const y of ["2026","2025","1975","1958"]) check(opts.includes(y), `${y} is selectable`);
  check(opts.indexOf("2026") < opts.indexOf("1958"), "newest first");

  const bodyAll = await p.evaluate(()=>document.body.innerText);
  check(/seasons on record/.test(bodyAll), `summary line: "${(bodyAll.match(/\d+ seasons on record[^\n]*/)||[""])[0]}"`);

  // Pick 1975 — a season nobody could read before without opening every comp.
  await p.selectOption("#roh-year", "1975");
  await p.waitForTimeout(600);
  const t75 = await p.evaluate(()=>document.body.innerText);
  console.log("      1975 →", (t75.split("Season")[1]||"").replace(/\n+/g," · ").slice(0,220));
  for (const [comp,win] of [["Gents Singles","K. Houston"],["Ladies Singles","Mrs J. Hamilton"],
                            ["Gents Presidents","H. Muir"],["Ladies Presidents","Mrs A. McGill"]])
    check(t75.includes(comp) && t75.includes(win), `1975 shows ${comp} — ${win}`);
  check(!t75.includes("S. Frame"), "1975 does not show a 2007 winner");
  check(!/Junior Girls/.test(t75), "a competition with nothing in 1975 is left out");

  await p.selectOption("#roh-year", "2026");
  await p.waitForTimeout(600);
  const t26 = await p.evaluate(()=>document.body.innerText);
  check(t26.includes("M. Kirkland") && t26.includes("Mrs L. Mair"), "2026 shows both Presidents winners by name");
  check(!t26.includes("K. McKenna"), "2026 does not show the 2025 singles winner");

  await p.selectOption("#roh-year", "all");
  await p.waitForTimeout(600);
  const tAll = await p.evaluate(()=>document.body.innerText);
  check(tAll.includes("Gents Singles") && tAll.includes("Rinks"), "All years lists every competition again, empty ones included");
  await b.close(); srv.close();
  console.log(`\n${fails===0?"ALL CHECKS PASSED":`${fails} CHECK(S) FAILED`}\n`);
  process.exit(fails===0?0:1);
});
