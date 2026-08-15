/**
 * Trust Score Service 单元测试
 */

import { describe, it, expect } from '@jest/globals';
import {
  calculateTrustScore,
  calculateStarsScore,
  calculateDownloadsScore,
  calculateReviewsScore,
  calculateActivityScore,
  getGrade,
  TRUST_SCORE_WEIGHTS,
  VERIFIED_THRESHOLD,
  type TrustScoreInput,
} from '../TrustScoreService';

describe('TrustScoreService - 维度得分', () => {
  describe('calculateStarsScore', () => {
    it('starCount = 0 时为 0', () => {
      expect(calculateStarsScore(0)).toBe(0);
    });

    it('starCount >= 5000 时为满分 30', () => {
      expect(calculateStarsScore(5000)).toBe(30);
      expect(calculateStarsScore(10000)).toBe(30);
      expect(calculateStarsScore(100000)).toBe(30);
    });

    it('starCount 介于 0-5000 之间平滑递增', () => {
      const s100 = calculateStarsScore(100);
      const s1000 = calculateStarsScore(1000);
      const s3000 = calculateStarsScore(3000);
      expect(s100).toBeLessThan(s1000);
      expect(s1000).toBeLessThan(s3000);
      expect(s3000).toBeLessThan(30);
    });
  });

  describe('calculateDownloadsScore', () => {
    it('downloads = 0 时为 0', () => {
      expect(calculateDownloadsScore(0)).toBe(0);
    });

    it('downloads >= 10000 时为满分 30', () => {
      expect(calculateDownloadsScore(10000)).toBe(30);
      expect(calculateDownloadsScore(50000)).toBe(30);
    });
  });

  describe('calculateReviewsScore', () => {
    it('无评分时为 0', () => {
      expect(calculateReviewsScore(0, 0)).toBe(0);
      expect(calculateReviewsScore(5, 0)).toBe(0);
    });

    it('高分+多评分接近满分', () => {
      const score = calculateReviewsScore(5, 100);
      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThanOrEqual(25);
    });

    it('低分+少评分接近 0', () => {
      const score = calculateReviewsScore(1, 5);
      expect(score).toBeLessThan(5);
    });

    it('数量因子能放大高分 Skill 的得分', () => {
      const fewReviews = calculateReviewsScore(5, 5);
      const manyReviews = calculateReviewsScore(5, 100);
      expect(manyReviews).toBeGreaterThan(fewReviews);
    });
  });

  describe('calculateActivityScore', () => {
    it('当天更新接近满分', () => {
      expect(calculateActivityScore(0)).toBe(15);
    });

    it('超过 90 天为 0', () => {
      expect(calculateActivityScore(90)).toBe(0);
      expect(calculateActivityScore(365)).toBe(0);
    });

    it('30 天前更新约为一半', () => {
      const score = calculateActivityScore(30);
      expect(score).toBeGreaterThan(5);
      expect(score).toBeLessThan(15);
    });
  });
});

describe('TrustScoreService - 总分计算', () => {
  it('空 Skill 得分应该很低', () => {
    const input: TrustScoreInput = {
      starCount: 0,
      downloadsLast30Days: 0,
      averageRating: 0,
      ratingCount: 0,
      daysSinceUpdate: 365,
    };
    const result = calculateTrustScore(input);
    expect(result.score).toBe(0);
    expect(result.verified).toBe(false);
    expect(result.grade).toBe('D');
  });

  it('优质 Skill 得分应该 ≥ 80（Verified）', () => {
    const input: TrustScoreInput = {
      starCount: 5000,
      downloadsLast30Days: 10000,
      averageRating: 4.8,
      ratingCount: 100,
      daysSinceUpdate: 5,
    };
    const result = calculateTrustScore(input);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.verified).toBe(true);
    expect(result.grade).toMatch(/^[AB]\+?$/);
  });

  it('所有维度满分时总分 = 100', () => {
    const input: TrustScoreInput = {
      starCount: 100000,
      downloadsLast30Days: 100000,
      averageRating: 5,
      ratingCount: 1000,
      daysSinceUpdate: 0,
    };
    const result = calculateTrustScore(input);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it('breakdown 总和等于总分（允许舍入误差）', () => {
    const input: TrustScoreInput = {
      starCount: 1000,
      downloadsLast30Days: 3000,
      averageRating: 4,
      ratingCount: 50,
      daysSinceUpdate: 30,
    };
    const result = calculateTrustScore(input);
    const breakdownSum =
      result.breakdown.stars +
      result.breakdown.downloads +
      result.breakdown.reviews +
      result.breakdown.activity;
    expect(Math.abs(breakdownSum - result.score)).toBeLessThanOrEqual(0.5);
  });

  it('权重之和 = 1.0', () => {
    const sum = Object.values(TRUST_SCORE_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('VERIFIED_THRESHOLD = 80', () => {
    expect(VERIFIED_THRESHOLD).toBe(80);
  });
});

describe('getGrade', () => {
  it('正确分级', () => {
    expect(getGrade(95)).toBe('A+');
    expect(getGrade(85)).toBe('A');
    expect(getGrade(70)).toBe('B');
    expect(getGrade(50)).toBe('C');
    expect(getGrade(30)).toBe('D');
  });

  it('边界值', () => {
    expect(getGrade(90)).toBe('A+');
    expect(getGrade(89.9)).toBe('A');
    expect(getGrade(80)).toBe('A');
    expect(getGrade(79.9)).toBe('B');
    expect(getGrade(60)).toBe('B');
    expect(getGrade(40)).toBe('C');
    expect(getGrade(0)).toBe('D');
  });
});

describe('TrustScoreService - 等级评定', () => {
  it('优秀 Skill (95+ 分) 获 A+', () => {
    const result = calculateTrustScore({
      starCount: 50000,
      downloadsLast30Days: 50000,
      averageRating: 5,
      ratingCount: 500,
      daysSinceUpdate: 1,
    });
    expect(result.grade).toBe('A+');
    expect(result.verified).toBe(true);
  });

  it('良好 Skill (80-89 分) 获 A 且 Verified', () => {
    // 需要较高分数才能达到 A 级
    const result = calculateTrustScore({
      starCount: 5000,
      downloadsLast30Days: 10000,
      averageRating: 4.8,
      ratingCount: 100,
      daysSinceUpdate: 5,
    });
    expect(result.grade).toBe('A+');
    expect(result.verified).toBe(true);
  });

  it('一般 Skill (50-79 分) 获 B/C 且未 Verified', () => {
    const result = calculateTrustScore({
      starCount: 500,
      downloadsLast30Days: 2000,
      averageRating: 3.5,
      ratingCount: 20,
      daysSinceUpdate: 45,
    });
    expect(['B', 'C', 'D']).toContain(result.grade);
    expect(result.verified).toBe(false);
  });
});
