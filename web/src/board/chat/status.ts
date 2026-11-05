// ボードのデモの状態から、エージェントに渡す状況（件数と時刻だけ）を作る（B-07、ADR-0047）。
// 薬の品目名・数量・カルテの文・架空の氏名は入れない。ここで作った値だけが画面の外（Workers 経由で Anthropic）に出る。

import { SHELTERS, siteInfo, type SiteId } from "../data";
import { clockText, patientsWithExtra, stampMinutes, type DemoState } from "../demo";
import { criticalItems, latestDate } from "../summary";
import { CHAT_SHELTERS, type ChatShelter, type ChatSiteStatus, type ChatStatus } from "./contract";

const SITE_OF: Readonly<Record<ChatShelter, SiteId>> = { A: "救護所A", B: "救護所B", C: "救護所C", D: "救護所D" };

export function siteIdOf(shelter: ChatShelter): SiteId {
  return SITE_OF[shelter];
}

/** 最終報告：在庫の確認か、記録が本部に届いた、新しいほうの時刻（BOARD_AS_OF からの分）。ボードの「最終報告」と同じ決め方 */
function lastReportAt(state: DemoState, site: SiteId): number | null {
  const times: number[] = [];
  const checked = siteInfo(site)?.stockCheckedAt;
  if (checked) times.push(stampMinutes(checked));
  const synced = state.sync.find((s) => s.site === site)?.lastSync;
  if (synced) times.push(stampMinutes(synced));
  return times.length > 0 ? Math.max(...times) : null;
}

export function chatStatus(state: DemoState): ChatStatus {
  const patients = patientsWithExtra(state);
  const today = latestDate(patients);
  const critical = criticalItems(state.stock);
  const sites: ChatSiteStatus[] = CHAT_SHELTERS.map((shelter) => {
    const site = SITE_OF[shelter];
    const info = siteInfo(site);
    const at = lastReportAt(state, site);
    return {
      site: shelter,
      patients: patients.find((r) => r.date === today && r.site === site)?.patients ?? null,
      shortItems: critical.filter((c) => c.site === site).length,
      pharmacistsShort: info ? Math.max(0, info.pharmacistsNeeded - info.pharmacists) : 0,
      pendingRecords: state.sync.find((s) => s.site === site)?.pending ?? null,
      lastReportMinutesAgo: at === null ? null : Math.max(0, state.minutes - at),
    };
  });
  return {
    clock: clockText(state.minutes),
    patientsToday: patients.filter((r) => r.date === today && SHELTERS.includes(r.site)).reduce((a, r) => a + r.patients, 0),
    shortageSites: sites.filter((s) => s.shortItems > 0 || s.pharmacistsShort > 0).length,
    sites,
  };
}
