/**
 * Selector desplegable multiselección con buscador integrado para elegir de forma opcional
 * uno o varios grupos musculares por ejercicio en rutinas de Fuerza o Híbridas.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { MuscleGroupId } from '../types';
import { ALL_MUSCLE_GROUPS, getLocalizedMuscleLabel } from '../utils/muscleRecovery';

interface MuscleGroupSelectProps {
  value: MuscleGroupId[];
  onChange: (nextMuscles: MuscleGroupId[]) => void;
  compact?: boolean;
}

function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const MuscleGroupSelect: React.FC<MuscleGroupSelectProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDownOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  const options = useMemo(
    () =>
      ALL_MUSCLE_GROUPS.map((id) => ({
        id,
        label: getLocalizedMuscleLabel(id, t),
      })),
    [t]
  );

  const filteredOptions = useMemo(() => {
    const normalized = normalizeSearchText(query);
    if (!normalized) return options;
    return options.filter((opt) => normalizeSearchText(opt.label).includes(normalized));
  }, [options, query]);

  const selectedSummary = useMemo(
    () => value.map((id) => getLocalizedMuscleLabel(id, t)).join(' · '),
    [value, t]
  );

  const handleToggleMuscle = (muscleId: MuscleGroupId) => {
    if (value.includes(muscleId)) {
      onChange(value.filter((item) => item !== muscleId));
    } else {
      const nextSet = new Set<MuscleGroupId>([...value, muscleId]);
      onChange(ALL_MUSCLE_GROUPS.filter((id) => nextSet.has(id)));
    }
  };

  const handleClearAll = () => {
    onChange([]);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      {!isOpen ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className={`input-field min-w-0 flex-1 flex items-center justify-between gap-2 text-left cursor-pointer ${
              compact ? 'min-h-[34px] px-2.5 py-1 text-[11px]' : 'min-h-[42px] px-3 py-2 text-xs'
            }`}
          >
            <span
              className={`truncate ${
                value.length > 0 ? 'text-fg font-medium' : 'text-fg-muted'
              }`}
            >
              {value.length > 0 ? selectedSummary : t.editor_muscles_label}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-fg-muted shrink-0" />
          </button>

          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              aria-label={t.editor_muscle_none}
              className={`btn-secondary flex items-center justify-center shrink-0 ${
                compact ? 'min-h-[34px] min-w-[32px]' : 'min-h-[42px] min-w-[38px]'
              }`}
            >
              <X className="w-3.5 h-3.5 text-fg-muted" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setQuery('');
              } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (filteredOptions.length > 0) {
                  handleToggleMuscle(filteredOptions[0].id);
                  setQuery('');
                } else {
                  setIsOpen(false);
                  setQuery('');
                }
              }
            }}
            placeholder={selectedSummary || t.editor_muscle_search_placeholder}
            aria-label={t.editor_muscles_label}
            className={`input-field w-full pl-8 pr-8 border-accent-fill ${
              compact ? 'min-h-[34px] py-1 text-[11px]' : 'min-h-[42px] py-2 text-xs'
            } placeholder:text-fg-muted`}
          />
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setQuery('');
            }}
            aria-label={t.common_close}
            className="btn-quiet absolute right-1 top-1/2 -translate-y-1/2 min-h-[28px] min-w-[28px] flex items-center justify-center"
          >
            <Check className="w-3.5 h-3.5 text-accent" />
          </button>
        </div>
      )}

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={t.editor_muscles_label}
          className="absolute bottom-full mb-1.5 left-0 right-0 z-30 max-h-48 overflow-y-auto modal-sheet rounded-[4px] py-1 divide-y divide-subtle"
        >
          {query.trim() === '' && (
            <button
              type="button"
              role="option"
              aria-selected={value.length === 0}
              onClick={handleClearAll}
              className={`w-full min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                value.length === 0
                  ? 'bg-accent-soft text-fg font-semibold'
                  : 'text-fg-muted hover:bg-elevated'
              }`}
            >
              <span className="truncate">{t.editor_muscle_none}</span>
              {value.length === 0 && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
            </button>
          )}

          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-fg-muted">{t.advanced_texts_no_results}</p>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = value.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleToggleMuscle(opt.id)}
                  className={`w-full min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-accent-soft text-fg font-semibold'
                      : 'text-fg-secondary hover:bg-elevated'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
