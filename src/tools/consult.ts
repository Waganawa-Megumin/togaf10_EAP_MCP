/**
 * コンサルティングツール / Consulting tool.
 *
 * 状況の自由記述を受け取り、該当するルールから
 * 関連フェーズ・推奨技法・作るべき成果物・推奨アクション・確認質問を返す。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  bullets,
  findDeliverable,
  findPhase,
  findTechnique,
  matchConsultRules,
  searchKnowledge,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import { loadEngagement } from '../engagement/store.js';
import { langSchema, msg, textResult } from './common.js';

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
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

export function registerConsultTool(server: McpServer): void {
  server.registerTool(
    'consult',
    {
      title: 'Consult on a situation',
      description:
        'アーキテクチャ上の状況を自由記述で渡すと、TOGAF ADM の観点で「見立て・着目すべきフェーズ・推奨技法・作るべき成果物・推奨アクション・ステークホルダーへの確認質問」を返す。 / Describe a situation in free text and get a TOGAF-based read: diagnosis, relevant ADM phases, recommended techniques, deliverables to produce, recommended actions, and questions to ask stakeholders.',
      inputSchema: {
        situation: z
          .string()
          .min(3)
          .describe('状況の自由記述(日本語/英語どちらでも可) / Free-text description of the situation'),
        currentPhase: z
          .string()
          .optional()
          .describe('現在の ADM フェーズ ID(任意) / Current ADM phase id, if any'),
        industry: z.string().optional().describe('業界(任意) / Industry, if relevant'),
        lang: langSchema,
      },
    },
    async ({ situation, currentPhase, industry, lang }) => {
      const l = lang as Lang;
      const engagement = loadEngagement();
      const phaseHint = currentPhase ?? engagement?.currentPhaseId;
      const resolvedPhase = phaseHint ? findPhase(phaseHint) : undefined;
      const matches = matchConsultRules(situation, resolvedPhase?.id);

      const out: string[] = [];
      out.push(msg('# TOGAF ベースの見立て', '# TOGAF-Based Assessment', l));
      out.push('');
      out.push(`> ${situation}`);
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
      if (industry) context.push(msg(`業界: ${industry}`, `Industry: ${industry}`, l));
      if (engagement) {
        context.push(msg(`案件: ${engagement.name}`, `Engagement: ${engagement.name}`, l));
      }
      if (context.length > 0) {
        out.push('');
        out.push(context.map((c) => `*${c}*`).join(' / '));
      }
      out.push('');

      if (matches.length === 0) {
        // ルール未マッチ時は知識ベース検索と現在フェーズの案内にフォールバックする
        out.push(
          msg(
            '定型パターンには一致しませんでした。知識ベースの近い項目と、現在フェーズの観点を示します。',
            'This did not match a known pattern. Here are the closest knowledge-base entries and the view from your current phase.',
            l,
          ),
        );
        out.push('');
        const hits = searchKnowledge(situation, { limit: 6 });
        if (hits.length > 0) {
          out.push(msg('## 関連しそうな項目', '## Possibly related entries', l));
          out.push('');
          for (const hit of hits) {
            out.push(`- [${hit.kind}] **${text(hit.title, l)}** (\`${hit.id}\`) — ${text(hit.snippet, l === 'both' ? 'ja' : l)}`);
          }
          out.push('');
        }
        const base = resolvedPhase ?? findPhase('a');
        if (base) {
          out.push(msg(`## ${base.code} の観点から`, `## From the perspective of Phase ${base.code}`, l));
          out.push('');
          out.push(bullets(base.steps, l));
          out.push('');
          out.push(msg('### 実務のコツ', '### Practitioner tips', l));
          out.push('');
          out.push(bullets(base.tips, l));
          out.push('');
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

      // --- 見立て ---
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
          `*${msg('反応したキーワード', 'Matched keywords', l)}: ${m.matchedKeywords.join(', ')}*`,
        );
        out.push('');
      }

      const phaseIds = uniq(matches.flatMap((m) => m.rule.phaseIds));
      const techniqueIds = uniq(matches.flatMap((m) => m.rule.techniqueIds));
      const deliverableIds = uniq(matches.flatMap((m) => m.rule.deliverableIds));
      const actions: Bilingual[] = [];
      const questions: Bilingual[] = [];
      const seenActions = new Set<string>();
      const seenQuestions = new Set<string>();
      for (const m of matches) {
        for (const a of m.rule.actions) {
          if (seenActions.has(a.ja)) continue;
          seenActions.add(a.ja);
          actions.push(a);
        }
        for (const q of m.rule.questions) {
          if (seenQuestions.has(q.ja)) continue;
          seenQuestions.add(q.ja);
          questions.push(q);
        }
      }

      // --- 着目すべきフェーズ ---
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

      // --- 推奨技法 ---
      out.push(msg('## 推奨技法', '## Recommended Techniques', l));
      out.push('');
      for (const id of techniqueIds) {
        const line = techniqueLine(id, l);
        if (line) out.push(`- ${line}`);
      }
      out.push('');

      // --- 作るべき成果物 ---
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

      // --- 推奨アクション ---
      out.push(msg('## 推奨アクション', '## Recommended Actions', l));
      out.push('');
      out.push(bullets(actions, l));
      out.push('');

      // --- 確認質問 ---
      out.push(msg('## ステークホルダーへの確認質問', '## Questions to Ask Stakeholders', l));
      out.push('');
      out.push(bullets(questions, l));
      out.push('');

      // --- 次の一手 ---
      out.push(msg('## 次の一手', '## Next Step', l));
      out.push('');
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
    },
  );
}
