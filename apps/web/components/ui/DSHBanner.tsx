'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Cpu, ArrowRight } from 'lucide-react';

interface DSHBannerProps {
  className?: string;
}

/**
 * 首页广告横幅：声明 SkillHub 已融合 DeepSeek Harness（DSH）开源技术，
 * 点击跳转到 /opensource/dsh 说明页。
 */
export default function DSHBanner({ className = '' }: DSHBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div
      className={`relative bg-linear-to-r from-amber-400 via-orange-500 to-rose-500 text-gray-900 overflow-hidden ${className}`}
    >
      {/* 关闭按钮 */}
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 hover:bg-black/10 rounded-lg transition-colors z-10"
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>

      <Link href="/opensource/dsh" className="block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 pr-16">
          <div className="flex items-center justify-between gap-4">
            {/* 左侧内容 */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="shrink-0 w-12 h-12 bg-white/30 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg truncate">
                    🚀 SkillHub 已融合 DeepSeek Harness（DSH）开源技术
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-900 text-amber-300 shrink-0">
                    OPEN SOURCE
                  </span>
                </div>
                <p className="text-sm text-gray-900/80 hidden md:block truncate">
                  SKILL.md 标准技能包可直接被 DSH 智能体框架加载执行，打通「技能市场 → Agent 运行」闭环
                </p>
              </div>
            </div>

            {/* 右侧按钮 */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="inline-flex items-center px-4 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm whitespace-nowrap">
                了解融合意义与用法
                <ArrowRight className="w-4 h-4 ml-1" />
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* 装饰性光效 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-white/20 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
