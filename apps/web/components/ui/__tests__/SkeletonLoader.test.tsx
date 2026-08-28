/**
 * SkeletonLoader 组件单元测试
 */

import { render } from '@testing-library/react';
import SkillsSkeleton, {
  FilterPanelSkeleton,
  SearchBoxSkeleton,
  HeroSkeleton,
  FullPageSkeleton 
} from '../SkeletonLoader';

describe('SkeletonLoader', () => {
  describe('SkillsSkeleton', () => {
    it('应该渲染默认数量的骨架卡片', () => {
      const { container } = render(<SkillsSkeleton />);
      
      // 默认是6个卡片
      const cards = container.querySelectorAll('.animate-pulse');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('应该支持自定义卡片数量', () => {
      const { container } = render(<SkillsSkeleton count={3} />);
      
      const cards = container.querySelectorAll('.animate-pulse');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('应该使用grid布局', () => {
      const { container } = render(<SkillsSkeleton />);
      
      const grid = container.firstChild;
      expect(grid).toHaveClass('grid');
      expect(grid).toHaveClass('grid-cols-1');
    });

    it('应该有响应式列数', () => {
      const { container } = render(<SkillsSkeleton />);
      
      const grid = container.firstChild;
      expect(grid).toHaveClass('md:grid-cols-2');
      expect(grid).toHaveClass('lg:grid-cols-3');
    });

    it('每个卡片应该有渐变条', () => {
      const { container } = render(<SkillsSkeleton count={1} />);
      
      const gradientBars = container.querySelectorAll('.bg-gradient-to-r');
      expect(gradientBars.length).toBeGreaterThan(0);
    });

    it('卡片应该有圆角和阴影', () => {
      const { container } = render(<SkillsSkeleton count={1} />);
      
      const card = container.querySelector('.rounded-2xl');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('shadow-lg');
    });
  });

  describe('FilterPanelSkeleton', () => {
    it('应该渲染筛选面板骨架屏', () => {
      const { container } = render(<FilterPanelSkeleton />);
      
      expect(container.firstChild).toBeInTheDocument();
    });

    it('应该有sticky定位', () => {
      const { container } = render(<FilterPanelSkeleton />);
      
      const panel = container.firstChild;
      expect(panel).toHaveClass('sticky');
      expect(panel).toHaveClass('top-4');
    });

    it('应该包含头部区域', () => {
      const { container } = render(<FilterPanelSkeleton />);
      
      // 检查是否有渐变图标背景
      const iconBg = container.querySelector('.from-blue-500');
      expect(iconBg).toBeInTheDocument();
    });

    it('应该包含排序选项占位符', () => {
      const { container } = render(<FilterPanelSkeleton />);
      
      const selects = container.querySelectorAll('.bg-gray-200');
      expect(selects.length).toBeGreaterThan(0);
    });

    it('应该包含应用按钮占位符', () => {
      const { container } = render(<FilterPanelSkeleton />);
      
      const button = container.querySelector('.from-blue-200');
      expect(button).toBeInTheDocument();
    });

    it('应该有脉冲动画', () => {
      const { container } = render(<FilterPanelSkeleton />);
      
      const panel = container.firstChild;
      expect(panel).toHaveClass('animate-pulse');
    });
  });

  describe('SearchBoxSkeleton', () => {
    it('应该渲染搜索框骨架屏', () => {
      const { container } = render(<SearchBoxSkeleton />);
      
      expect(container.firstChild).toBeInTheDocument();
    });

    it('应该有居中对齐', () => {
      const { container } = render(<SearchBoxSkeleton />);
      
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('mx-auto');
      expect(wrapper).toHaveClass('max-w-3xl');
    });

    it('应该包含搜索图标占位符', () => {
      const { container } = render(<SearchBoxSkeleton />);
      
      const icon = container.querySelector('.absolute.left-4');
      expect(icon).toBeInTheDocument();
    });

    it('应该包含输入框占位符', () => {
      const { container } = render(<SearchBoxSkeleton />);
      
      const input = container.querySelector('.rounded-xl');
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass('h-14');
    });

    it('应该包含按钮占位符', () => {
      const { container } = render(<SearchBoxSkeleton />);
      
      const button = container.querySelector('.right-2');
      expect(button).toBeInTheDocument();
    });

    it('应该有脉冲动画', () => {
      const { container } = render(<SearchBoxSkeleton />);
      
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('animate-pulse');
    });
  });

  describe('HeroSkeleton', () => {
    it('应该渲染Hero区域骨架屏', () => {
      const { container } = render(<HeroSkeleton />);
      
      expect(container.firstChild).toBeInTheDocument();
    });

    it('应该有渐变背景', () => {
      const { container } = render(<HeroSkeleton />);
      
      const hero = container.firstChild;
      expect(hero).toHaveClass('from-blue-600');
      expect(hero).toHaveClass('via-indigo-700');
      expect(hero).toHaveClass('to-purple-800');
    });

    it('应该包含标题占位符', () => {
      const { container } = render(<HeroSkeleton />);
      
      const title = container.querySelector('.h-12');
      expect(title).toBeInTheDocument();
    });

    it('应该包含副标题占位符', () => {
      const { container } = render(<HeroSkeleton />);
      
      const subtitle = container.querySelector('.h-6');
      expect(subtitle).toBeInTheDocument();
    });

    it('应该包含统计信息区域', () => {
      const { container } = render(<HeroSkeleton />);
      
      const stats = container.querySelector('.grid-cols-3');
      expect(stats).toBeInTheDocument();
    });

    it('应该包含搜索框', () => {
      const { container } = render(<HeroSkeleton />);
      
      const searchBox = container.querySelector('.max-w-3xl');
      expect(searchBox).toBeInTheDocument();
    });

    it('应该有脉冲动画', () => {
      const { container } = render(<HeroSkeleton />);
      
      const hero = container.firstChild;
      expect(hero).toHaveClass('animate-pulse');
    });

    it('统计信息应该有3列', () => {
      const { container } = render(<HeroSkeleton />);
      
      const statItems = container.querySelectorAll('.text-center');
      expect(statItems.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('FullPageSkeleton', () => {
    it('应该渲染完整页面骨架屏', () => {
      const { container } = render(<FullPageSkeleton />);
      
      expect(container.firstChild).toBeInTheDocument();
    });

    it('应该包含导航栏骨架屏', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const nav = container.querySelector('nav');
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveClass('sticky');
    });

    it('应该包含Hero区域', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const hero = container.querySelector('.from-blue-600');
      expect(hero).toBeInTheDocument();
    });

    it('应该包含快速标签区域', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const tags = container.querySelector('.overflow-x-auto');
      expect(tags).toBeInTheDocument();
    });

    it('应该包含侧边栏', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const sidebar = container.querySelector('aside');
      expect(sidebar).toBeInTheDocument();
      expect(sidebar).toHaveClass('w-64');
    });

    it('应该包含主内容区', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
      expect(main).toHaveClass('flex-1');
    });

    it('应该包含结果信息占位符', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const resultsInfo = container.querySelector('.flex.items-center.justify-between');
      expect(resultsInfo).toBeInTheDocument();
    });

    it('应该包含分页占位符', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const pagination = container.querySelector('.mt-8');
      expect(pagination).toBeInTheDocument();
    });

    it('应该有正确的背景渐变', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('from-gray-50');
      expect(wrapper).toHaveClass('via-white');
      expect(wrapper).toHaveClass('to-gray-100');
    });

    it('导航栏应该有毛玻璃效果', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('backdrop-blur-md');
      expect(nav).toHaveClass('bg-white/90');
    });

    it('快速标签应该是sticky的', () => {
      const { container } = render(<FullPageSkeleton />);
      
      const tagsWrapper = container.querySelector('.border-b.border-gray-200');
      expect(tagsWrapper).toHaveClass('sticky');
    });
  });

  describe('通用特性', () => {
    it('所有骨架屏都应该有pulse动画类', () => {
      const { container: c1 } = render(<SkillsSkeleton />);
      const { container: c2 } = render(<FilterPanelSkeleton />);
      const { container: c3 } = render(<SearchBoxSkeleton />);
      const { container: c4 } = render(<HeroSkeleton />);
      const { container: c5 } = render(<FullPageSkeleton />);

      expect(c1.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(c2.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(c3.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(c4.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(c5.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('所有骨架屏都应该使用灰色系颜色', () => {
      const { container: c1 } = render(<SkillsSkeleton />);
      const { container: c2 } = render(<FilterPanelSkeleton />);

      expect(c1.querySelector('.bg-gray-200')).toBeInTheDocument();
      expect(c2.querySelector('.bg-gray-200')).toBeInTheDocument();
    });
  });
});
