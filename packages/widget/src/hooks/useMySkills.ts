import { useState, useCallback } from 'react';
import type { LocalSkill } from '../types';

interface UseMySkillsOptions {
  onSkillUpdate?: () => void;
   
  onSkillPublish?: (skillId: string) => void;
}

export function useMySkills(options: UseMySkillsOptions = {}) {
  const { onSkillUpdate, onSkillPublish } = options;
  
  const [skills, setSkills] = useState<LocalSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载本地 Skills（从 localStorage 或 IndexedDB）
  const loadSkills = useCallback(() => {
    setLoading(true);
    try {
      const stored = localStorage.getItem('my_skills');
      if (stored) {
        setSkills(JSON.parse(stored));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 保存 Skills 到本地存储
  const saveSkills = useCallback((newSkills: LocalSkill[]) => {
    try {
      localStorage.setItem('my_skills', JSON.stringify(newSkills));
      setSkills(newSkills);
      onSkillUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }, [onSkillUpdate]);

  // 添加新 Skill
  const addSkill = useCallback((skill: Omit<LocalSkill, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newSkill: LocalSkill = {
      ...skill,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const newSkills = [...skills, newSkill];
    saveSkills(newSkills);
    
    return newSkill;
  }, [skills, saveSkills]);

  // 更新 Skill
  const updateSkill = useCallback((skillId: string, updates: Partial<LocalSkill>) => {
    const newSkills = skills.map(skill => 
      skill.id === skillId 
        ? { ...skill, ...updates, updatedAt: new Date().toISOString() }
        : skill
    );
    saveSkills(newSkills);
  }, [skills, saveSkills]);

  // 删除 Skill
  const deleteSkill = useCallback((skillId: string) => {
    const newSkills = skills.filter(skill => skill.id !== skillId);
    saveSkills(newSkills);
  }, [skills, saveSkills]);

  // 发布 Skill 到 SkillHub
  const publishSkill = useCallback(async (skillId: string, authToken: string, apiUrl: string) => {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) {
      throw new Error('Skill 不存在');
    }

    setLoading(true);
    setError(null);

    try {
      // 调用 SkillHub API 发布
      const response = await fetch(`${apiUrl}/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: skill.name,
          slug: skill.slug,
          description: skill.description,
          version: skill.version || '1.0.0',
          category: skill.category,
          tags: skill.tags,
          content: skill.content,
        }),
      });

      if (!response.ok) {
        throw new Error('发布失败');
      }

      // 更新本地状态
      updateSkill(skillId, { isPublished: true });
      onSkillPublish?.(skillId);

      return await response.json();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发布失败';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [skills, updateSkill, onSkillPublish]);

  // 初始化时加载
  useState(() => {
    loadSkills();
  });

  return {
    skills,
    loading,
    error,
    loadSkills,
    addSkill,
    updateSkill,
    deleteSkill,
    publishSkill,
  };
}
