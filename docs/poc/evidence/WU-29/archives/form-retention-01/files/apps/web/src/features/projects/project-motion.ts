import { useLayoutEffect, useRef } from 'react';
import type { AnimationEvent } from 'react';
import { useInitialRouteEntry } from '../../app/shell/route-entry-context';

// An embedded renderer can expose multiple visual siblings through display:
// contents. Only boxes that really animate own completion; hidden/table and
// coverage wrappers cannot emit an animationend event.
function animatedBoxes(parent: Element | null): HTMLElement[] {
  return [...(parent?.children ?? [])].flatMap(child => {
    if (!(child instanceof HTMLElement)) return [];
    const css = getComputedStyle(child);
    if (css.display === 'none') return [];
    if (css.display === 'contents') return animatedBoxes(child);
    return css.animationName === 'none' ? [] : [child];
  });
}

// Source go()/render() consumes a route/tab flag once. Its original animation
// remains on that DOM until the next render; canonical updates never replay it.
export function useProjectMotion<T extends HTMLElement = HTMLDivElement>(pathname: string, revision: string, scope: 'project' | 'page' = 'project', interactionRevision = '', animateInitial?: boolean) {
  const initialRouteEntry = useInitialRouteEntry(), shouldAnimateInitial = animateInitial ?? !initialRouteEntry;
  const host = useRef<T>(null), state = useRef({ pathname: '', revision: '', interactionRevision, complete: false });
  useLayoutEffect(() => {
    const node = host.current; if (!node) return;
    if (state.current.pathname !== pathname) {
      const first = !state.current.pathname;
      if (first && !shouldAnimateInitial) delete node.dataset.projectTransition;
      else node.dataset.projectTransition = first ? 'route' : 'tab';
      const parent = first ? node : node.querySelector('[data-project-body]');
      const owners = first && !shouldAnimateInitial ? [] : animatedBoxes(parent).filter(child => !(first && scope === 'project') || child.hasAttribute('data-project-header') || child.hasAttribute('data-project-body'));
      state.current = { pathname, revision, interactionRevision, complete: owners.length === 0 };
    } else if (state.current.revision !== revision) { state.current.revision = revision; if (state.current.complete) delete node.dataset.projectTransition; }
    if (state.current.interactionRevision !== interactionRevision) { state.current.interactionRevision = interactionRevision; delete node.dataset.projectTransition; }
  });
  const onAnimationEnd = (event: AnimationEvent<T>) => {
    const node = host.current, target = event.target;
    if (!node || !(target instanceof HTMLElement)) return;
    const owners = animatedBoxes(node.dataset.projectTransition === 'route' ? node : node.querySelector('[data-project-body]'));
    if (owners.includes(target)) state.current.complete = owners.every(owner => owner.getAnimations().every(animation => animation.playState === 'finished'));
  };
  return { hostRef: host, onAnimationEnd };
}

