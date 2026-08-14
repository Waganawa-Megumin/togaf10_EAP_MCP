/**
 * 知識ベースの Markdown 整形 / Markdown rendering for knowledge-base entries.
 */

import {
  bullets,
  findDeliverable,
  findPhase,
  findTechnique,
  text,
  type AdmPhase,
  type Deliverable,
  type GlossaryTerm,
  type Lang,
  type Technique,
} from '../knowledge/index.js';

const H = {
  purpose: { ja: '目的', en: 'Purpose' },
  inputs: { ja: '主な入力', en: 'Key inputs' },
  steps: { ja: '主なステップ', en: 'Key steps' },
  outputs: { ja: '主な成果物', en: 'Key outputs' },
  tips: { ja: '実務のコツ', en: 'Practitioner tips' },
  related: { ja: '関連', en: 'Related' },
  techniques: { ja: '技法', en: 'Techniques' },
  deliverables: { ja: '成果物', en: 'Deliverables' },
  phases: { ja: 'フェーズ', en: 'Phases' },
  summary: { ja: '概要', en: 'Summary' },
  whenToUse: { ja: '適用場面', en: 'When to use' },
  howTo: { ja: '進め方', en: 'How to run it' },
  pitfalls: { ja: '落とし穴', en: 'Pitfalls' },
  contents: { ja: '記載項目', en: 'Contents' },
  createdIn: { ja: '主に作成するフェーズ', en: 'Created in' },
  refinedIn: { ja: '更新・参照するフェーズ', en: 'Refined in' },
  definition: { ja: '定義', en: 'Definition' },
};

/** フェーズ ID の配列を "A: 名称" の一覧に整形する */
function phaseRefs(ids: string[], lang: Lang): string {
  const names = ids
    .map((id) => findPhase(id))
    .filter((p): p is AdmPhase => Boolean(p))
    .map((p) => `${p.code} (${text(p.name, lang === 'both' ? 'ja' : lang)})`);
  return names.length > 0 ? names.join(', ') : '—';
}

function techniqueRefs(ids: string[], lang: Lang): string {
  const names = ids
    .map((id) => findTechnique(id))
    .filter((t): t is Technique => Boolean(t))
    .map((t) => `${text(t.name, lang === 'both' ? 'ja' : lang)} (\`${t.id}\`)`);
  return names.length > 0 ? names.join(', ') : '—';
}

function deliverableRefs(ids: string[], lang: Lang): string {
  const names = ids
    .map((id) => findDeliverable(id))
    .filter((d): d is Deliverable => Boolean(d))
    .map((d) => `${text(d.name, lang === 'both' ? 'ja' : lang)} (\`${d.id}\`)`);
  return names.length > 0 ? names.join(', ') : '—';
}

/** ADM フェーズの詳細 */
export function renderPhase(phase: AdmPhase, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${phase.code}. ${text(phase.name, lang)}`);
  out.push('');
  out.push(`*${text(phase.tagline, lang)}*`);
  out.push('');
  out.push(`## ${text(H.purpose, lang)}`);
  out.push('');
  out.push(text(phase.purpose, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(phase.purpose.en);
  }
  out.push('');
  out.push(`## ${text(H.inputs, lang)}`);
  out.push('');
  out.push(bullets(phase.inputs, lang));
  out.push('');
  out.push(`## ${text(H.steps, lang)}`);
  out.push('');
  out.push(bullets(phase.steps, lang));
  out.push('');
  out.push(`## ${text(H.outputs, lang)}`);
  out.push('');
  out.push(bullets(phase.outputs, lang));
  out.push('');
  out.push(`## ${text(H.tips, lang)}`);
  out.push('');
  out.push(bullets(phase.tips, lang));
  out.push('');
  out.push(`## ${text(H.related, lang)}`);
  out.push('');
  out.push(`- **${text(H.techniques, lang)}**: ${techniqueRefs(phase.techniqueIds, lang)}`);
  out.push(`- **${text(H.deliverables, lang)}**: ${deliverableRefs(phase.deliverableIds, lang)}`);
  out.push('');
  return out.join('\n');
}

/** 技法の詳細 */
export function renderTechnique(technique: Technique, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${text(technique.name, lang)}`);
  out.push('');
  out.push(`## ${text(H.summary, lang)}`);
  out.push('');
  out.push(text(technique.summary, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(technique.summary.en);
  }
  out.push('');
  out.push(`## ${text(H.whenToUse, lang)}`);
  out.push('');
  out.push(bullets(technique.whenToUse, lang));
  out.push('');
  out.push(`## ${text(H.howTo, lang)}`);
  out.push('');
  out.push(bullets(technique.steps, lang));
  out.push('');
  out.push(`## ${text(H.pitfalls, lang)}`);
  out.push('');
  out.push(bullets(technique.pitfalls, lang));
  out.push('');
  out.push(`- **${text(H.phases, lang)}**: ${phaseRefs(technique.phaseIds, lang)}`);
  out.push('');
  return out.join('\n');
}

/** 成果物の詳細 */
export function renderDeliverable(deliverable: Deliverable, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${text(deliverable.name, lang)}`);
  out.push('');
  out.push(`## ${text(H.summary, lang)}`);
  out.push('');
  out.push(text(deliverable.summary, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(deliverable.summary.en);
  }
  out.push('');
  out.push(`- **${text(H.createdIn, lang)}**: ${phaseRefs(deliverable.createdInPhaseIds, lang)}`);
  out.push(`- **${text(H.refinedIn, lang)}**: ${phaseRefs(deliverable.refinedInPhaseIds, lang)}`);
  out.push('');
  out.push(`## ${text(H.contents, lang)}`);
  out.push('');
  out.push(bullets(deliverable.contents, lang));
  out.push('');
  out.push(`## ${text(H.tips, lang)}`);
  out.push('');
  out.push(bullets(deliverable.tips, lang));
  out.push('');
  return out.join('\n');
}

/** 用語の詳細 */
export function renderGlossaryTerm(term: GlossaryTerm, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${text(term.term, lang)}`);
  out.push('');
  out.push(text(term.definition, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(term.definition.en);
  }
  out.push('');
  return out.join('\n');
}

/**
 * 成果物の Markdown 雛形を生成する。
 * template が定義されていればそれを、なければ contents から節を組み立てる。
 */
export function renderDeliverableTemplate(
  deliverable: Deliverable,
  lang: Lang,
  engagementName?: string,
): string {
  const out: string[] = [];
  const title = text(deliverable.name, lang);
  out.push(`# ${title}${engagementName ? ` — ${engagementName}` : ''}`);
  out.push('');
  out.push(
    lang === 'en'
      ? '> Document control: version / author / date / approver'
      : lang === 'ja'
        ? '> 文書管理: 版数 / 作成者 / 日付 / 承認者'
        : '> 文書管理 / Document control: 版数 (version) / 作成者 (author) / 日付 (date) / 承認者 (approver)',
  );
  out.push('');

  if (deliverable.template && deliverable.template.length > 0) {
    for (const section of deliverable.template) {
      out.push(`## ${text(section.heading, lang)}`);
      out.push('');
      out.push(`> ${text(section.guidance, lang)}`);
      out.push('');
      if (section.bullets && section.bullets.length > 0) {
        out.push(bullets(section.bullets, lang));
        out.push('');
      }
      out.push('');
    }
  } else {
    deliverable.contents.forEach((item, i) => {
      out.push(`## ${i + 1}. ${text(item, lang)}`);
      out.push('');
      out.push('');
    });
  }

  out.push('---');
  out.push('');
  out.push(`### ${text(H.tips, lang)}`);
  out.push('');
  out.push(bullets(deliverable.tips, lang));
  out.push('');
  return out.join('\n');
}
