import type {
	CandidateCore,
	PickResult,
	ReviewState,
} from "./types";
import type { SpacedDiveSettings } from "./settings";
import { addDays } from "./utils";

/**
 * 抽谁、怎么算下一次 —— 全部纯函数, 不碰 app, 方便单测。
 *
 * 逻辑基本移植自 Meta/Spaced Review/picker.py, 但修了原版一个方向搞反的 bug:
 * 原版 `decay ** (WINDOW - index)`, index 越大(越近期)反而降权越轻,
 * 和注释里"最近抽过的分区降权"正好相反。这里改成按"最后一次出现的远近"衰减。
 */
export class Scheduler {
	constructor(private getSettings: () => SpacedDiveSettings) {}

	/** 综合权重: 逾期度 x 复习次数 x 分区平衡 x 内容厚度 */
	weight(candidate: CandidateCore, recentDomains: string[]): number {
		const s = this.getSettings();

		if (candidate.state) {
			if (candidate.state.skip) return 0;
			const overdue = candidate.overdueDays ?? -1;
			if (overdue < 0) return 0; // 还没到期
			let w = 1 + Math.log1p(Math.max(0, overdue)); // 越逾期越急
			w *= 1 + 0.35 * Math.min(candidate.state.times, 5);
			if (candidate.sizeChars < s.minChars) w *= 0.3;
			w *= this.domainFactor(candidate.domain, recentDomains);
			return Math.max(0, w);
		}

		// 冷启动: 用冻结诞生日当遗忘代理
		let w = 0.8 + 0.55 * Math.log1p(candidate.bornDays);
		if (candidate.sizeChars < s.minChars) w *= 0.15;
		w *= this.domainFactor(candidate.domain, recentDomains);
		return Math.max(0, w);
	}

	/**
	 * 分区平衡系数。
	 * 近期抽过的分区压权重, 越近期压得越狠(0 < decay < 1)。
	 */
	private domainFactor(domain: string, recentDomains: string[]): number {
		const s = this.getSettings();
		if (!domain || recentDomains.length === 0) return 1;
		const lastIdx = recentDomains.lastIndexOf(domain);
		if (lastIdx < 0) return 1;
		return Math.pow(s.recentDecay, lastIdx + 1);
	}

	/** 加权随机抽一张。泛型: 传 Candidate[] 就返回 Candidate, 传纯数据就返回纯数据。 */
	pick<T extends CandidateCore>(
		candidates: T[],
		recentDomains: string[],
	): PickResult<T> | null {
		const s = this.getSettings();
		if (candidates.length === 0) return null;

		const fresh: T[] = candidates.filter((c) => c.state === null);
		const due: T[] = candidates.filter(
			(c) =>
				c.state !== null &&
				!c.state.skip &&
				(c.overdueDays ?? -1) >= 0,
		);

		let pool: T[] = due;
		let mode: PickResult["mode"] = "review";
		if (Math.random() < s.exploreRate || due.length === 0) {
			pool = fresh;
			mode = "explore";
		}
		if (pool.length === 0) {
			pool = fresh.length > 0 ? fresh : candidates;
			mode = pool === fresh ? "explore" : "review";
		}
		if (pool.length === 0) return null;

		const weights = pool.map((c) => this.weight(c, recentDomains));
		const total = weights.reduce((a, b) => a + b, 0);
		let chosen: T;
		if (total <= 0) {
			// 全被压成 0, 退回纯随机
			chosen = pool[Math.floor(Math.random() * pool.length)];
		} else {
			chosen = weightedChoice(pool, weights, total);
		}

		return { candidate: chosen, mode, poolSize: pool.length };
	}

	/** 到期/逾期清单, 按逾期天数降序 */
	dueList<T extends CandidateCore>(candidates: T[]): T[] {
		return candidates
			.filter(
				(c) =>
					c.state !== null &&
					!c.state.skip &&
					(c.overdueDays ?? -1) >= 0,
			)
			.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
	}

	/**
	 * 由评分推算新状态。
	 * @param bornISO 笔记的冻结诞生日, 首次复习时落进 sr-added 后就不再变
	 */
	nextState(
		prev: ReviewState | null,
		quality: number,
		today: string,
		bornISO: string,
	): Partial<ReviewState> {
		const s = this.getSettings();

		if (quality === 0) {
			return {
				skip: true,
				added: prev?.added ?? bornISO,
				last: today,
				quality: 0,
			};
		}

		const prevStep = prev?.step ?? s.initialStep;
		let step = prevStep;
		if (quality >= 4) {
			step = Math.min(prevStep + 1, s.intervals.length - 1);
		} else if (quality === 3) {
			step = prevStep;
		} else {
			step = Math.max(0, prevStep - s.stepsBackOnFail);
		}

		const interval = s.intervals[Math.min(step, s.intervals.length - 1)] ?? 1;

		return {
			skip: false,
			added: prev?.added ?? bornISO,
			step,
			times: (prev?.times ?? 0) + 1,
			last: today,
			quality,
			due: addDays(today, interval) ?? today,
		};
	}
}

/** 轮盘赌。weights 与 items 等长, total 已预先求和。 */
function weightedChoice<T>(
	items: T[],
	weights: number[],
	total: number,
): T {
	let r = Math.random() * total;
	for (let i = 0; i < items.length; i++) {
		r -= weights[i];
		if (r <= 0) return items[i];
	}
	return items[items.length - 1];
}
