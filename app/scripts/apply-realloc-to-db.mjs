#!/usr/bin/env node
/**
 * apply-realloc-to-db.mjs
 * org 11 acc_book을 자금원 재배분(Option B 캐스케이드) 결과로 수정.
 * 기본 DRY-RUN(읽기만, 변경 셋 출력). --apply 시에만 실제 UPDATE/INSERT.
 * 사전 백업: backups/acc_book_org11_*.json
 */
import { readFileSync } from "fs"; import { resolve } from "path"; import { createClient } from "@supabase/supabase-js";
const p=resolve(process.cwd(),".env.local"); for(const l of readFileSync(p,"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();if(!process.env[k])process.env[k]=t.slice(i+1).trim();}
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{db:{schema:"pfam"}});
const APPLY = process.argv.includes("--apply");
const ORG=11;
const SRC={82:"보조금",83:"보조금외",84:"후보자자산",85:"후원회기부금"};
const won=n=>Number(n).toLocaleString("ko-KR");

function cmp(a,b){ if(a.acc_date!==b.acc_date) return a.acc_date<b.acc_date?-1:1; const ta=a.acc_time??"",tb=b.acc_time??""; if(ta===tb)return 0; return ta<tb?-1:1; }
function reallocate(rows){
  const priority=[84,83,82]; const sorted=[...rows].sort((a,b)=>cmp(a,b)||a.incm_sec_cd-b.incm_sec_cd||a.acc_book_id-b.acc_book_id);
  const avail=new Map(); const get=s=>avail.get(s)??0; const out=[];
  for(const r of sorted){
    if(r.incm_sec_cd===1){ avail.set(r.acc_sec_cd,get(r.acc_sec_cd)+r.acc_amt); out.push({r,parts:[{src:r.acc_sec_cd,amt:r.acc_amt}]}); continue; }
    if(r.acc_amt<=0){ avail.set(r.acc_sec_cd,get(r.acc_sec_cd)-r.acc_amt); out.push({r,parts:[{src:r.acc_sec_cd,amt:r.acc_amt}]}); continue; }
    const S=r.acc_sec_cd; let need=r.acc_amt; const useS=Math.min(need,Math.max(0,get(S))); avail.set(S,get(S)-useS); need-=useS;
    const parts=[]; if(useS>0) parts.push({src:S,amt:useS});
    const moves=[];
    for(const O of priority){ if(need<=0)break; if(O===S)continue; const a=Math.max(0,get(O)); if(a<=0)continue; const u=Math.min(need,a); avail.set(O,get(O)-u); need-=u; moves.push({src:O,amt:u}); }
    if(need>0)for(const O of [...avail.keys()]){ if(need<=0)break; if(O===S||priority.includes(O))continue; const a=Math.max(0,get(O)); if(a<=0)continue; const u=Math.min(need,a); avail.set(O,get(O)-u); need-=u; moves.push({src:O,amt:u}); }
    if(need>0){ avail.set(S,get(S)-need); parts.push({src:S,amt:need}); } // 진짜부족(없을 것)
    for(const m of moves) parts.push(m);
    if(parts.length===0) parts.push({src:S,amt:r.acc_amt});
    out.push({r,parts});
  }
  return out;
}

const { data: rows, error } = await sb.from("acc_book").select("*").eq("org_id",ORG);
if(error){console.error(error.message);process.exit(1);}
const out = reallocate(rows);

// 변경 셋 계산
const updates=[]; // {row, newSrc, newAmt}  (acc_book_id 유지)
const inserts=[]; // 신규 행(원본 복제 + src/amt 덮어쓰기)
for(const {r,parts} of out){
  if(r.incm_sec_cd!==1 && r.acc_amt>0){
    // 지출(양수)만 재배분 대상
    if(parts.length===1 && parts[0].src===r.acc_sec_cd) continue; // 무변경
    // 원본 행을 유지할 part: 원 자금원에 남은 part 우선, 없으면 첫 part
    const keepIdx = parts.findIndex(p=>p.src===r.acc_sec_cd);
    const ki = keepIdx>=0?keepIdx:0;
    const keep=parts[ki];
    if(keep.src!==r.acc_sec_cd || keep.amt!==r.acc_amt) updates.push({row:r,newSrc:keep.src,newAmt:keep.amt});
    parts.forEach((pt,idx)=>{ if(idx===ki)return; inserts.push({base:r,src:pt.src,amt:pt.amt}); });
  }
}

// 출력
const claimUpdates = updates.filter(u=>u.row.claim_amt!=null);
const claimSplits = inserts.filter(i=>i.base.claim_amt!=null);
console.log(`=== 재배분 DB 반영 ${APPLY?"(APPLY)":"(DRY-RUN)"} — org ${ORG} ===`);
console.log(`UPDATE ${updates.length}건, INSERT ${inserts.length}건. 결과 acc_book ${rows.length} → ${rows.length+inserts.length}행`);
console.log(`\n[UPDATE] (acc_book_id 유지, 계정/금액 변경)`);
for(const u of updates) console.log(`  #${u.row.acc_book_id} ${u.row.acc_date} "${(u.row.content??"").slice(0,16)}" ${SRC[u.row.acc_sec_cd]}/${won(u.row.acc_amt)} → ${SRC[u.newSrc]}/${won(u.newAmt)}${u.row.claim_amt!=null?` (claim_amt ${won(u.row.claim_amt)} 유지)`:""}`);
console.log(`\n[INSERT] (신규 행, rcp_no 비움)`);
for(const i of inserts) console.log(`  ←#${i.base.acc_book_id} ${i.base.acc_date} "${(i.base.content??"").slice(0,16)}" ${SRC[i.src]}/${won(i.amt)}${i.base.claim_amt!=null?` (claim_amt 분할 필요!)`:""}`);
console.log(`\n⚠ claim_amt(보전청구액) 보유 행: UPDATE중 ${claimUpdates.length}, 분할(INSERT)중 ${claimSplits.length} — 분할 시 보전 금액 처리 결정 필요`);

if(!APPLY){ console.log("\n(DRY-RUN — 실제 변경 없음. 실행하려면 --apply)"); process.exit(0); }

// claim_amt(보전청구액) 행이 재배분/분할 대상이면 보전 금액 복제 위험 → 분배 규칙 확정 전 --apply 차단
if(claimUpdates.length || claimSplits.length){
  console.error(`\n중단: claim_amt 보유 행이 재배분 대상입니다 (UPDATE ${claimUpdates.length}, 분할 ${claimSplits.length}). 보전 금액 분배 규칙을 먼저 적용한 뒤 --apply 하세요.`);
  process.exit(1);
}

// === APPLY ===
// ⚠ 한계: 아래 UPDATE/INSERT는 개별 요청이라 원자적이지 않다(트랜잭션/RPC 미사용). 중간 실패 시
//   부분 반영이 남을 수 있으므로 반드시 사전 백업(backups/acc_book_org11_*.json) 후 실행하고,
//   실패하면 백업으로 복구한다. 원자성이 필요하면 서버측 RPC 일괄 처리로 확장할 것.
console.log("\n적용 중...");
let nU=0,nI=0;
for(const u of updates){ const upd={acc_sec_cd:u.newSrc, acc_amt:u.newAmt}; if(u.newSrc!==u.row.acc_sec_cd){ upd.rcp_no=null; upd.rcp_no2=null; } const {error}=await sb.from("acc_book").update(upd).eq("acc_book_id",u.row.acc_book_id); if(error){console.error(`UPDATE #${u.row.acc_book_id} 실패:`,error.message);process.exit(1);} nU++; }
for(const i of inserts){ const row={...i.base}; delete row.acc_book_id; row.acc_sec_cd=i.src; row.acc_amt=i.amt; row.rcp_no=null; row.rcp_no2=null; const {error}=await sb.from("acc_book").insert(row); if(error){console.error(`INSERT ←#${i.base.acc_book_id} 실패:`,error.message);process.exit(1);} nI++; }
console.log(`완료: UPDATE ${nU}, INSERT ${nI}`);
// 검증
const { data: after } = await sb.from("acc_book").select("incm_sec_cd,acc_sec_cd,acc_date,acc_time,acc_amt,acc_book_id").eq("org_id",ORG);
const sorted=[...after].sort((a,b)=>cmp(a,b)||a.incm_sec_cd-b.incm_sec_cd||a.acc_book_id-b.acc_book_id);
const bal={},min={};
for(const r of sorted){const s=r.acc_sec_cd; bal[s]=(bal[s]??0)+(r.incm_sec_cd===1?r.acc_amt:-r.acc_amt); min[s]=min[s]===undefined?bal[s]:Math.min(min[s],bal[s]);}
console.log("적용 후 자금원별 최저잔액:");
for(const s of [84,85,83,82]) if(min[s]!==undefined) console.log(`  ${SRC[s]}: 최저 ${won(min[s])} ${min[s]<0?"⚠":"✓"}`);
