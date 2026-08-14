/**
 * コンサルティングツール / Consulting tool.
 *
 * 状況の自由記述を受け取り、該当するルールから
 * 関連フェーズ・推奨技法・作るべき成果物・推奨アクション・確認質問を返す。
 *
 * ここで重要なのは「話題が同じでも状況が違えば助言も違う」という点。
 * 予算ゼロ・ひとり体制の相談者に、予算潤沢・専任チーム向けの助言を返すのは害になる。
 * そのため次の 3 つを本文から読み取り、出力に反映する。
 *
 * 1. 打ち消し — 「やらないことに決まった」話題はルールを発火させない(外した事実は明示する)
 * 2. 条件    — 予算 / 期限 / 経営の関与 / 体制 / 既存資料 / 決定権 / 現場の空気 / 規制
 * 3. 業界    — `industry` 引数(または本文からの推定)で見立てと質問を業界の言葉に寄せる
 *
 * ルールが持つアクション・質問は位置で切らず、上記との関連が強い順に並べ替えてから絞る。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  bullets,
  detectIndustryCapabilitySets,
  findDeliverable,
  findIndustryCapabilitySet,
  findPhase,
  findTechnique,
  matchConsultRules,
  searchKnowledge,
  text,
  INDUSTRY_CAPABILITY_SETS,
  type Bilingual,
  type IndustryCapabilitySet,
  type IndustryReferenceCapability,
  type Lang,
  type RuleMatch,
} from '../knowledge/index.js';
import {
  SITUATION_AXIS_LABELS,
  rankByRelevance,
  readSituation,
  situationAdvice,
  type SituationAxis,
  type SituationReading,
} from '../knowledge/consulting.js';
import { loadEngagement } from '../engagement/store.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/** 箇条書きの内側で使う 1 行。both でも改行しない(改行するとリストが壊れる) */
function inline(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 箇条書き 1 件。both では bullets() と同じく英語を子項目にする */
function bulletPair(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return `- ${ja}`;
  if (lang === 'en') return `- ${en}`;
  return `- ${ja}\n  - ${en}`;
}

/** Markdown 表に入れる前に、区切りを壊す文字を無害化する */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function phaseLine(id: string, lang: Lang): string | null {
  const p = findPhase(id);
  if (!p) return null;
  return `**${p.code}. ${text(p.name, lang)}** — ${text(p.tagline, lang)}`;
}

function techniqueLine(id: string, lang: Lang): string | null {
  const t = findTechnique(id);
  if (!t) return null;
  return `**${text(t.name, lang)}** (\`${t.id}\`) — ${text(t.summary, lang === 'both' ? 'ja' : lang)}`;
}

function deliverableLine(id: string, lang: Lang): string | null {
  const d = findDeliverable(id);
  if (!d) return null;
  return `**${text(d.name, lang)}** (\`${d.id}\`) — ${text(d.summary, lang === 'both' ? 'ja' : lang)}`;
}

/** ID 群を、名称と要約の文面で状況との関連順に並べ替える */
function rankIds(
  ids: string[],
  lookup: (id: string) => { name: Bilingual; summary?: Bilingual } | undefined,
  reading: SituationReading,
  extraTerms: string[],
  limit: number,
): string[] {
  const entries: { id: string; blob: Bilingual }[] = [];
  for (const id of ids) {
    const found = lookup(id);
    if (!found) continue;
    entries.push({
      id,
      blob: {
        ja: `${found.name.ja} ${found.summary?.ja ?? ''}`,
        en: `${found.name.en} ${found.summary?.en ?? ''}`,
      },
    });
  }
  const index = new Map(entries.map((e) => [e.blob, e.id]));
  const ranked = rankByRelevance(
    entries.map((e) => e.blob),
    reading,
    extraTerms,
    limit,
  );
  return ranked.map((b) => index.get(b)).filter((v): v is string => typeof v === 'string');
}

/** 業界の解決結果 */
interface IndustryResolution {
  set?: IndustryCapabilitySet;
  /** given=引数で指定 / detected=本文から推定 / unsupported=引数はあるが未対応 / none=手がかり無し */
  source: 'given' | 'detected' | 'unsupported' | 'none';
  requested?: string;
}

function resolveIndustry(industry: string | undefined, reading: SituationReading): IndustryResolution {
  const requested = industry?.trim();
  if (requested && requested.length > 0) {
    const set = findIndustryCapabilitySet(requested);
    return set ? { set, source: 'given', requested } : { source: 'unsupported', requested };
  }
  const detected = detectIndustryCapabilitySets(reading.positiveText).filter((d) => d.confident);
  const top = detected[0];
  return top ? { set: top.set, source: 'detected' } : { source: 'none' };
}

/** 状況文に出てくる語で、その業界のどの能力が話題かを絞る */
function relevantIndustryCapabilities(
  set: IndustryCapabilitySet,
  reading: SituationReading,
  limit: number,
): { caps: IndustryReferenceCapability[]; fromText: boolean } {
  const hay = reading.positiveText.toLowerCase();
  const hit = set.capabilities.filter((c) =>
    c.triggers.some((t) => hay.includes(t.toLowerCase())),
  );
  if (hit.length > 0) return { caps: hit.slice(0, limit), fromText: true };
  return {
    caps: set.capabilities.filter((c) => c.group === 'core' && c.universal).slice(0, limit),
    fromText: false,
  };
}

function industryNameList(lang: Lang): string {
  return INDUSTRY_CAPABILITY_SETS.map((s) => `${text(s.name, lang === 'both' ? 'ja' : lang)} (\`${s.id}\`)`).join(' / ');
}

/** 引用に入れる節。長すぎる節は切り詰める(表・引用を壊さないよう cell を通す) */
function quoteClause(value: string, max = 60): string {
  const one = cell(value);
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * 業界の観点(見立てが立った場合も、定型に一致しなかった場合も同じものを出す)。
 *
 * 返す `questions` は、その業界でしか聞けない確認事項。
 */
function industrySection(
  info: IndustryResolution,
  reading: SituationReading,
  l: Lang,
): { lines: string[]; questions: Bilingual[] } {
  const lines: string[] = [];
  const questions: Bilingual[] = [];
  if (info.set) {
    const set = info.set;
    const { caps, fromText } = relevantIndustryCapabilities(set, reading, 3);
    lines.push(msg(`## 業界の観点 — ${text(set.name, 'ja')}`, `## Industry View — ${set.name.en}`, l));
    lines.push('');
    lines.push(text(set.essence, l === 'both' ? 'ja' : l));
    lines.push('');
    if (caps.length > 0) {
      lines.push(
        fromText
          ? msg(
              'ご相談の文面に出ている語から、先に見るべき業界固有の能力:',
              'Industry-specific capabilities picked up from the wording of your description:',
              l,
            )
          : msg(
              '相談文からは業界固有の語を拾えなかったので、この業界の中核能力を挙げます(当たっていなければ無視してください):',
              'Your description contains no industry-specific vocabulary, so these are simply this industry\'s core capabilities — ignore them if they do not apply:',
              l,
            ),
      );
      lines.push('');
      for (const c of caps) {
        lines.push(`- **${text(c.name, l)}** — ${text(c.definition, l === 'both' ? 'ja' : l)}`);
        const weak = c.weakSigns[0];
        if (weak) {
          lines.push(
            `  - ${inline('弱いと起きること', 'When it is weak', l)}: ${text(weak, l === 'both' ? 'ja' : l)}`,
          );
        }
        const probe = c.probes[0];
        if (probe) questions.push(probe);
      }
      lines.push('');
    }
    const notes = set.notes.slice(0, 2);
    if (notes.length > 0) {
      lines.push(msg('この業界で外すと痛い点:', 'What hurts if you get it wrong in this industry:', l));
      lines.push('');
      lines.push(bullets(notes, l));
      lines.push('');
    }
    lines.push(
      msg(
        `能力の一覧が要るなら \`get_industry_capability_set\` に \`${set.id}\` を渡してください。`,
        `Pass \`${set.id}\` to \`get_industry_capability_set\` for the full capability list.`,
        l,
      ),
    );
    lines.push('');
  } else if (info.source === 'unsupported' && info.requested) {
    lines.push(msg('## 業界の観点', '## Industry View', l));
    lines.push('');
    lines.push(
      msg(
        `「${cell(info.requested)}」は業界別の知識セットに入っていないので、業界固有の助言は出せません。以下は業界を問わない一般論として読んでください。`,
        `"${cell(info.requested)}" is not in the industry knowledge sets, so no industry-specific guidance is available. Read the rest as general, industry-neutral advice.`,
        l,
      ),
    );
    lines.push('');
    lines.push(
      msg(`用意があるのは: ${industryNameList(l)}`, `Available industry sets: ${industryNameList(l)}`, l),
    );
    lines.push('');
  }
  return { lines, questions };
}

export function registerConsultTool(server: McpServer): void {
  server.registerTool(
    'consult',
    {
      title: 'Consult on a situation',
      description:
        'アーキテクチャ上の状況を自由記述で渡すと、TOGAF ADM の観点で「見立て・着目すべきフェーズ・推奨技法・作るべき成果物・推奨アクション・ステークホルダーへの確認質問」を返す。予算・期限・経営の関与・体制などの条件を本文から読み取り、助言の中身を条件に合わせて変える。「やらないことに決まった」話題は見立てから外す。 / Describe a situation in free text and get a TOGAF-based read: diagnosis, relevant ADM phases, techniques, deliverables, actions, and questions to ask. Constraints stated in the text — budget, deadline, executive engagement, staffing — change what is recommended, and topics you say are off the table are excluded.',
      inputSchema: {
        situation: z
          .string()
          .min(3)
          .describe(
            '状況の自由記述(日本語/英語どちらでも可)。予算・期限・体制・経営の関与など、制約も一緒に書くほど助言が具体的になる / Free-text description of the situation. The more constraints you state — budget, deadline, staffing, executive engagement — the more specific the guidance.',
          ),
        currentPhase: z
          .string()
          .optional()
          .describe('現在の ADM フェーズ ID(任意) / Current ADM phase id, if any'),
        industry: z
          .string()
          .optional()
          .describe('業界(任意)。対応業界なら見立てと質問に反映する / Industry, if relevant. Supported industries change the read and the questions.'),
        lang: langSchema,
      },
    },
    async ({ situation, currentPhase, industry, lang }) => {
      try {
        const l = lang as Lang;
        const engagement = loadEngagement();
        const phaseHint = currentPhase ?? engagement?.currentPhaseId;
        const resolvedPhase = phaseHint ? findPhase(phaseHint) : undefined;

        // --- 1. 状況を読む(打ち消し・条件・内容語) ---
        const reading = readSituation(situation);
        const searchText = reading.positiveText.length >= 3 ? reading.positiveText : situation;
        const matches = matchConsultRules(searchText, resolvedPhase?.id);
        const excluded: RuleMatch[] =
          reading.hasNegation && reading.negatedText.length >= 3
            ? matchConsultRules(reading.negatedText, resolvedPhase?.id).filter(
                (e) => !matches.some((m) => m.rule.id === e.rule.id),
              )
            : [];
        const advice = situationAdvice(reading);
        const industryInfo = resolveIndustry(industry, reading);

        const out: string[] = [];
        out.push(msg('# TOGAF ベースの見立て', '# TOGAF-Based Assessment', l));
        out.push('');
        out.push(`> ${cell(situation)}`);

        const context: string[] = [];
        if (resolvedPhase) {
          context.push(
            msg(
              `現在フェーズ: ${resolvedPhase.code}. ${text(resolvedPhase.name, 'ja')}`,
              `Current phase: ${resolvedPhase.code}. ${resolvedPhase.name.en}`,
              l,
            ),
          );
        }
        if (industryInfo.set) {
          const name = text(industryInfo.set.name, l === 'both' ? 'ja' : l);
          context.push(
            industryInfo.source === 'detected'
              ? msg(`業界(本文から推定): ${name}`, `Industry (inferred from the text): ${name}`, l)
              : msg(`業界: ${name}`, `Industry: ${name}`, l),
          );
        } else if (industryInfo.source === 'unsupported' && industryInfo.requested) {
          context.push(
            msg(
              `業界: ${cell(industryInfo.requested)}(未対応)`,
              `Industry: ${cell(industryInfo.requested)} (not supported)`,
              l,
            ),
          );
        }
        if (engagement) {
          context.push(msg(`案件: ${engagement.name}`, `Engagement: ${engagement.name}`, l));
        }
        if (context.length > 0) {
          out.push('');
          out.push(context.map((c) => `*${cell(c)}*`).join(' / '));
        }
        out.push('');

        // --- 2. 読み取った状況 ---
        out.push(msg('## 読み取った状況', '## What I Read From Your Description', l));
        out.push('');
        if (reading.conditions.length > 0) {
          out.push(
            msg(
              '| 観点 | 読み取り | 根拠にした語 |',
              '| Aspect | Read | Evidence in your text |',
              l === 'both' ? 'ja' : l,
            ),
          );
          out.push('| --- | --- | --- |');
          for (const d of reading.conditions) {
            const axis = SITUATION_AXIS_LABELS[d.condition.axis];
            out.push(
              `| ${cell(text(axis, l === 'both' ? 'ja' : l))} | ${cell(text(d.condition.label, l))} | ${cell(d.cues.slice(0, 3).join(', '))} |`,
            );
          }
          out.push('');
          out.push(
            msg(
              '以下の助言は、この読み取りに合わせて内容を変えています。読み取りが違っていれば、その旨を書いてもう一度呼んでください。',
              'The guidance below is shaped by this read. If any of it is wrong, say so and call the tool again.',
              l,
            ),
          );
        } else {
          out.push(
            msg(
              '予算・期限・体制・経営の関与といった条件は文中に書かれていなかったので、決めつけずに一般的な助言にしています。',
              'Your description does not state constraints such as budget, deadline, staffing, or executive engagement, so the guidance below stays general rather than assuming any of them.',
              l,
            ),
          );
        }
        if (reading.unknownAxes.length > 0) {
          const jaNames = reading.unknownAxes.map((a: SituationAxis) => SITUATION_AXIS_LABELS[a].ja).join(' / ');
          const enNames = reading.unknownAxes.map((a: SituationAxis) => SITUATION_AXIS_LABELS[a].en).join(' / ');
          out.push('');
          out.push(
            msg(
              `*記述が無いため判断していない観点: ${cell(jaNames)}。ここを書き足すと助言が変わります。*`,
              `*Not judged, because your text says nothing about them: ${cell(enNames)}. Adding any of these changes the guidance.*`,
              l,
            ),
          );
        }
        if (reading.hedged.length > 0) {
          const quoted = reading.hedged.map((c) => `「${quoteClause(c.text, 40)}」`).join('');
          const quotedEn = reading.hedged.map((c) => `"${quoteClause(c.text, 40)}"`).join(', ');
          out.push('');
          out.push(
            msg(
              `*${quoted}は二重否定・留保の言い回しなので、肯定とも打ち消しとも取らず判断を保留しました。どちらの意味かを言い切ってもらえれば助言が変わります。*`,
              `*${quotedEn} reads as a double negative or a hedge, so it is treated as neither a statement nor a retraction. State it plainly either way and the guidance changes.*`,
              l,
            ),
          );
        }
        out.push('');

        // --- 3. 打ち消された話題 ---
        // 根拠は打ち消し語だけでなく、その語が出てきた節ごと引く。
        // 「ではなく」だけを見せられても、外した判断が正しいか読者が確かめられない。
        // 節を特定できないものは、根拠を示せない以上「外した」と言わずに黙って通す。
        const excludedLines = excluded
          .map((e) => {
            const clause = reading.clauses.find(
              (c) => c.negated && e.matchedKeywords.some((k) => c.text.toLowerCase().includes(k.toLowerCase())),
            );
            if (!clause) return null;
            const evidence = quoteClause(clause.text);
            if (evidence.length === 0) return null;
            return bulletPair(
              `**${e.rule.name.ja}** — 「${evidence}」と伺ったので、この見立てからは外しました。`,
              `**${e.rule.name.en}** — you said "${evidence}", so it is left out of this read.`,
              l,
            );
          })
          .filter((line): line is string => line !== null);
        if (excludedLines.length > 0) {
          out.push(msg('## 対象外として外した話題', '## Topics Excluded as Off the Table', l));
          out.push('');
          out.push(...excludedLines);
          out.push('');
          out.push(
            msg(
              '*外すのが誤りなら、その話題も対象だと書いてもう一度呼んでください。*',
              '*If that is wrong, say the topic is in scope and call again.*',
              l,
            ),
          );
          out.push('');
        }

        // --- 4. ルール未マッチ時 ---
        if (matches.length === 0) {
          out.push(
            msg(
              '## 見立て\n\n定型パターンには一致しませんでした。知識ベースの近い項目と、現在フェーズの観点を示します。',
              '## Diagnosis\n\nThis did not match a known pattern. Here are the closest knowledge-base entries and the view from your current phase.',
              l,
            ),
          );
          out.push('');
          const hits = searchKnowledge(searchText, { limit: 6 });
          if (hits.length > 0) {
            out.push(msg('### 関連しそうな項目', '### Possibly related entries', l));
            out.push('');
            for (const hit of hits) {
              out.push(
                `- [${hit.kind}] **${text(hit.title, l)}** (\`${hit.id}\`) — ${text(hit.snippet, l === 'both' ? 'ja' : l)}`,
              );
            }
            out.push('');
          }
          const base = resolvedPhase ?? findPhase('a');
          if (base) {
            out.push(msg(`### ${base.code} の観点から`, `### From the perspective of Phase ${base.code}`, l));
            out.push('');
            out.push(bullets(base.steps, l));
            out.push('');
          }
          if (advice.actions.length > 0) {
            out.push(
              msg(
                '### あなたの状況の条件から言えること',
                '### What your stated constraints already imply',
                l,
              ),
            );
            out.push('');
            for (const d of reading.conditions) {
              out.push(bulletPair(d.condition.implication.ja, d.condition.implication.en, l));
            }
            out.push('');
            out.push(bullets(advice.actions, l));
            out.push('');
            if (advice.questions.length > 0) {
              out.push(msg('### まず確認したいこと', '### Worth confirming first', l));
              out.push('');
              out.push(bullets(advice.questions, l));
              out.push('');
            }
          }
          // 定型に一致しなくても、業界が分かっているなら業界の観点は出せる
          const fallbackIndustry = industrySection(industryInfo, reading, l);
          if (fallbackIndustry.lines.length > 0) {
            out.push(...fallbackIndustry.lines);
            if (fallbackIndustry.questions.length > 0 && industryInfo.set) {
              out.push(
                msg(
                  `**${text(industryInfo.set.name, 'ja')}ならではの確認**`,
                  `**Specific to ${industryInfo.set.name.en}**`,
                  l,
                ),
              );
              out.push('');
              out.push(bullets(fallbackIndustry.questions.slice(0, 2), l));
              out.push('');
            }
          }
          out.push(
            msg(
              '状況をもう少し具体的に(何が起きていて、誰が困っていて、何を決めたいのか)書くと、より具体的な提案ができます。',
              'Describe the situation more concretely — what is happening, who is stuck, and what decision you need — and the guidance gets much sharper.',
              l,
            ),
          );
          return textResult(out.join('\n'));
        }

        // --- 5. 見立て ---
        out.push(msg('## 見立て', '## Diagnosis', l));
        out.push('');
        for (const m of matches) {
          out.push(`### ${text(m.rule.name, l)}`);
          out.push('');
          out.push(text(m.rule.diagnosis, l === 'both' ? 'ja' : l));
          if (l === 'both') {
            out.push('');
            out.push(m.rule.diagnosis.en);
          }
          out.push('');
          out.push(
            `*${inline('反応したキーワード', 'Matched keywords', l)}: ${cell(m.matchedKeywords.join(', '))}*`,
          );
          out.push('');
        }

        if (reading.conditions.length > 0 || reading.combos.length > 0) {
          out.push(
            msg(
              '### あなたの状況では、この見立てはこう変わる',
              '### How your situation changes that read',
              l,
            ),
          );
          out.push('');
          for (const combo of reading.combos) {
            out.push(
              bulletPair(
                `**${combo.label.ja}** — ${combo.advice.ja}`,
                `**${combo.label.en}** — ${combo.advice.en}`,
                l,
              ),
            );
          }
          for (const d of reading.conditions) {
            out.push(
              bulletPair(
                `**${d.condition.label.ja}** — ${d.condition.implication.ja}`,
                `**${d.condition.label.en}** — ${d.condition.implication.en}`,
                l,
              ),
            );
          }
          out.push('');
        }

        // 並べ替えに使う語(状況の内容語 + 一致したキーワード)
        const matchedTerms = uniq(matches.flatMap((m) => m.matchedKeywords));

        // --- 6. フェーズ / 技法 / 成果物 ---
        const phaseIds = uniq(matches.flatMap((m) => m.rule.phaseIds));
        out.push(msg('## 着目すべき ADM フェーズ', '## ADM Phases to Focus On', l));
        out.push('');
        const orderedPhases = phaseIds
          .map((id) => findPhase(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .sort((a, b) => a.order - b.order);
        for (const p of orderedPhases) {
          const line = phaseLine(p.id, l);
          if (line) out.push(`- ${line}`);
        }
        out.push('');

        const techniqueBudget = uniq(matches.flatMap((m) => m.rule.techniqueIds)).length;
        const techniqueIds = rankIds(
          uniq(matches.flatMap((m) => m.fullRule.techniqueIds)),
          (id) => findTechnique(id),
          reading,
          matchedTerms,
          Math.max(techniqueBudget, 1),
        );
        out.push(msg('## 推奨技法', '## Recommended Techniques', l));
        out.push('');
        for (const id of techniqueIds) {
          const line = techniqueLine(id, l);
          if (line) out.push(`- ${line}`);
        }
        out.push('');

        const deliverableBudget = uniq(matches.flatMap((m) => m.rule.deliverableIds)).length;
        const deliverableIds = rankIds(
          uniq(matches.flatMap((m) => m.fullRule.deliverableIds)),
          (id) => findDeliverable(id),
          reading,
          matchedTerms,
          Math.max(deliverableBudget, 1),
        );
        out.push(msg('## 作るべき成果物', '## Deliverables to Produce', l));
        out.push('');
        for (const id of deliverableIds) {
          const line = deliverableLine(id, l);
          if (line) out.push(`- ${line}`);
        }
        out.push('');
        out.push(
          msg(
            '雛形が必要なら `generate_deliverable_template` に上記の ID を渡してください。',
            'Pass any id above to `generate_deliverable_template` for a Markdown skeleton.',
            l,
          ),
        );
        out.push('');

        // --- 7. 業界の観点 ---
        const industryOut = industrySection(industryInfo, reading, l);
        out.push(...industryOut.lines);
        const industryQuestions = industryOut.questions;

        // --- 8. 推奨アクション ---
        out.push(msg('## 推奨アクション', '## Recommended Actions', l));
        out.push('');
        if (advice.actions.length > 0) {
          out.push(
            msg(
              '**あなたの状況の条件に対して(ここが最優先)**',
              '**For the constraints you stated (do these first)**',
              l,
            ),
          );
          out.push('');
          out.push(bullets(advice.actions, l));
          out.push('');
        }
        // ルール側は位置ではなく状況との関連で選ぶ。条件由来の助言がある分だけ数を譲る。
        const reserve = advice.actions.length > 0 ? 2 : 0;
        const ruleActions: Bilingual[] = [];
        const seenActions = new Set<string>(advice.actions.map((a) => a.ja));
        for (const m of matches) {
          const limit = Math.max(2, m.rule.actions.length - reserve);
          for (const a of rankByRelevance(m.fullRule.actions, reading, m.matchedKeywords, limit)) {
            if (seenActions.has(a.ja)) continue;
            seenActions.add(a.ja);
            ruleActions.push(a);
          }
        }
        if (ruleActions.length > 0) {
          out.push(
            msg(
              '**この話題の定石として(状況に近い順)**',
              '**Standard practice for this topic (ordered by fit to your situation)**',
              l,
            ),
          );
          out.push('');
          out.push(bullets(ruleActions, l));
          out.push('');
        }

        // --- 9. 確認質問 ---
        out.push(msg('## ステークホルダーへの確認質問', '## Questions to Ask Stakeholders', l));
        out.push('');
        const seenQuestions = new Set<string>();
        if (advice.questions.length > 0) {
          out.push(msg('**状況の条件について**', '**About the constraints you stated**', l));
          out.push('');
          out.push(bullets(advice.questions, l));
          out.push('');
          for (const q of advice.questions) seenQuestions.add(q.ja);
        }
        const reserveQ = advice.questions.length > 0 ? 1 : 0;
        const ruleQuestions: Bilingual[] = [];
        for (const m of matches) {
          const limit = Math.max(2, m.rule.questions.length - reserveQ);
          for (const q of rankByRelevance(m.fullRule.questions, reading, m.matchedKeywords, limit)) {
            if (seenQuestions.has(q.ja)) continue;
            seenQuestions.add(q.ja);
            ruleQuestions.push(q);
          }
        }
        if (ruleQuestions.length > 0) {
          out.push(msg('**この話題について**', '**About the topic itself**', l));
          out.push('');
          out.push(bullets(ruleQuestions, l));
          out.push('');
        }
        const industryQ = industryQuestions.filter((q) => !seenQuestions.has(q.ja)).slice(0, 2);
        if (industryQ.length > 0 && industryInfo.set) {
          out.push(
            msg(
              `**${text(industryInfo.set.name, 'ja')}ならではの確認**`,
              `**Specific to ${industryInfo.set.name.en}**`,
              l,
            ),
          );
          out.push('');
          out.push(bullets(industryQ, l));
          out.push('');
        }

        // --- 10. 次の一手 ---
        out.push(msg('## 次の一手', '## Next Step', l));
        out.push('');
        const firstAction = advice.actions[0] ?? ruleActions[0];
        if (firstAction) {
          out.push(
            msg(
              `今日やることを 1 つに絞るなら: ${firstAction.ja}`,
              `If you do one thing today: ${firstAction.en}`,
              l,
            ),
          );
          out.push('');
        }
        if (engagement) {
          out.push(
            msg(
              `\`update_engagement\` で上記のアクションやリスクを案件「${engagement.name}」に登録し、\`get_dashboard\` / \`open_dashboard\` で進捗を可視化できます。`,
              `Register these actions and risks against "${engagement.name}" with \`update_engagement\`, then use \`get_dashboard\` or \`open_dashboard\` to track them.`,
              l,
            ),
          );
        } else {
          out.push(
            msg(
              '`start_engagement` で案件を開始すると、上記のアクション・リスク・成果物を進捗管理できます。',
              'Start an engagement with `start_engagement` to track these actions, risks, and deliverables.',
              l,
            ),
          );
        }
        out.push('');

        return textResult(out.join('\n'));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return errorResult(
          `consult の実行に失敗しました / consult failed: ${detail.replace(/\r?\n/g, ' ')}`,
        );
      }
    },
  );
}
