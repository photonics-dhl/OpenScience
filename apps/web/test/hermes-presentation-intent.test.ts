import { describe, expect, it } from 'vitest';
import { routeHermesPresentationIntent, researchObjectFromHermesPath } from '../lib/hermes/presentation-intent';

describe('Hermes presentation preparation', () => {
  it('prepares scoped edits while preserving the complete feedback', () => {
    for (const instruction of ['请把第二幕改得通俗一点', 'Revise the storyboard to explain diffraction clearly']) {
      expect(routeHermesPresentationIntent(instruction)).toEqual({ action: 'storyboard.revise', instruction });
    }
    expect(routeHermesPresentationIntent('帮我生成科普分镜')).toEqual({ action: 'storyboard.create', instruction: '帮我生成科普分镜' });
  });
  it('recognizes make as creation', () => {
    expect(routeHermesPresentationIntent('Make a storyboard')).toEqual({ action: 'storyboard.create', instruction: 'Make a storyboard' });
  });
  it('only recognizes bounded image commands and never silently drops new art instructions', () => {
    expect(routeHermesPresentationIntent('请为第二幕生成图片')).toEqual({ action: 'scene.image', instruction: '请为第二幕生成图片', sceneIndex: 1 });
    expect(routeHermesPresentationIntent('Generate an image for scene 3')).toEqual({ action: 'scene.image', instruction: 'Generate an image for scene 3', sceneIndex: 2 });
    expect(routeHermesPresentationIntent('为第二幕生成图片，改成水墨')).toEqual({ action: 'storyboard.revise', instruction: '为第二幕生成图片，改成水墨' });
    expect(routeHermesPresentationIntent('为第99幕生成图片')).toBeNull();
  });
  it('keeps questions, negation, publication and literature requests out of the action route', () => {
    for (const input of ['什么是分镜？', '不要生成图片', 'do not generate an image', '发布这个分镜', 'find papers about image generation', 'generate an image and publish it', '']) expect(routeHermesPresentationIntent(input)).toBeNull();
  });
  it('finds RO context on every nested RO surface without treating new research as an object', () => {
    for (const suffix of ['edit', 'presentation', 'files', 'versions']) expect(researchObjectFromHermesPath('/research-objects/ro-1/' + suffix)).toBe('ro-1');
    expect(researchObjectFromHermesPath('/research-objects/new')).toBeUndefined();
    expect(researchObjectFromHermesPath('/dashboard')).toBeUndefined();
  });
});
