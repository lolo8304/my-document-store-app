/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import * as OutlineIcons from '@heroicons/react/24/outline';
import * as SolidIcons from '@heroicons/react/24/solid';

export type HeroIconStyle = 'outline' | 'solid';

type OutlineName = keyof typeof OutlineIcons;
type SolidName = keyof typeof SolidIcons;

export type HeroIconName = OutlineName | SolidName;

const FALLBACK_ICON = OutlineIcons.QuestionMarkCircleIcon;

export interface DynamicHeroIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'style'> {
  /**
   * Heroicon name, e.g.
   * UserIcon
   * Cog6ToothIcon
   * HomeIcon
   */
  name: string;

  /**
   * outline | solid
   * default = outline
   */
  style?: HeroIconStyle;
}

/**
 * Returns true if an icon exists.
 */
export function heroIconExists(name: string, style: HeroIconStyle = 'outline'): boolean {
  const icons = style === 'solid' ? SolidIcons : OutlineIcons;

  return name in icons;
}

export function normalizeHeroIconName(input: string): string {
  const value = input.trim();
  if (!value) {
    return '';
  }
  const withoutIconSuffix = value.replace(/Icon$/i, '');
  const words = withoutIconSuffix
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  return `${words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')}Icon`;
}

export function resolveHeroIconName(input?: string, style: HeroIconStyle = 'outline'): string | undefined {
  if (!input?.trim()) {
    return undefined;
  }
  const normalized = normalizeHeroIconName(input);
  return heroIconExists(normalized, style) ? normalized : undefined;
}

export function hasHeroIconInput(input?: string): boolean {
  return Boolean(input?.trim());
}

/**
 * Returns the React component of an icon.
 */
export function getHeroIcon(name: string, style: HeroIconStyle = 'outline'): React.ComponentType<React.SVGProps<SVGSVGElement>> {
  const icons = style === 'solid' ? SolidIcons : OutlineIcons;

  return (
    (icons[name as keyof typeof icons] as React.ComponentType<
      React.SVGProps<SVGSVGElement>
    >) ?? FALLBACK_ICON
  );
}

/**
 * Dynamic HeroIcon component.
 */
export function DynamicHeroIcon({ name, style = 'outline', ...props }: DynamicHeroIconProps) {
  const Icon = getHeroIcon(name, style);

  return <Icon {...props} />;
}

/**
 * Returns all available icon names.
 */
export function getAllHeroIconNames(style: HeroIconStyle = 'outline'): string[] {
  const icons = style === 'solid' ? SolidIcons : OutlineIcons;

  return Object.keys(icons).sort();
}

/**
 * Returns all available icon names (both outline + solid).
 */
export function getAllHeroIcons(): {
  outline: string[];
  solid: string[];
} {
  return {
    outline: getAllHeroIconNames('outline'),
    solid: getAllHeroIconNames('solid'),
  };
}
