"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";

export type CurriculumLesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  durationSec: number | null;
};

export type CurriculumGroup = {
  key: string;
  title: string | null;
  moduleIndex: number | null;
  lessons: CurriculumLesson[];
};

type Props = {
  courseSlug: string;
  groups: CurriculumGroup[];
  completedIds: string[];
  unlockedIds: string[];
};

function formatDuration(sec: number | null) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CourseCurriculum({
  courseSlug,
  groups,
  completedIds,
  unlockedIds,
}: Props) {
  const completed = useMemo(() => new Set(completedIds), [completedIds]);
  const unlocked = useMemo(() => new Set(unlockedIds), [unlockedIds]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.key)),
  );

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  let anim = 0;

  return (
    <div className="curriculum-list">
      {groups.map((group) => {
        const hasTitle = Boolean(group.title);
        const open = !hasTitle || openKeys.has(group.key);

        return (
          <div
            key={group.key}
            className={`curriculum-group${open ? " is-open" : ""}`}
          >
            {hasTitle && (
              <button
                type="button"
                className="curriculum-group__toggle"
                aria-expanded={open}
                onClick={() => toggle(group.key)}
              >
                <span className="curriculum-group__title">
                  {group.moduleIndex != null ? `${group.moduleIndex}. ` : ""}
                  {group.title}
                </span>
                <Icon
                  name={open ? "expand_less" : "expand_more"}
                  size={22}
                  className="curriculum-group__chevron"
                />
              </button>
            )}

            {open &&
              group.lessons.map((lesson) => {
                const i = anim++;
                const isUnlocked = unlocked.has(lesson.id);
                const done = completed.has(lesson.id);

                if (!isUnlocked) {
                  return (
                    <div
                      key={lesson.id}
                      className="curriculum-item curriculum-item--locked anim-rise"
                      style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                    >
                      <span className="curriculum-item__num">
                        <Icon name="lock" size={18} />
                      </span>
                      <span className="curriculum-item__body">
                        <span className="curriculum-item__title">
                          {lesson.title}
                        </span>
                        <span className="curriculum-item__desc">
                          ล็อก — ดูบทก่อนหน้าให้ครบก่อน
                        </span>
                      </span>
                      <span className="curriculum-item__dur">
                        {formatDuration(lesson.durationSec)}
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={lesson.id}
                    href={`/learn/${courseSlug}/${lesson.slug}`}
                    className="curriculum-item anim-rise"
                    style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  >
                    <span className="curriculum-item__num">
                      <Icon
                        name={done ? "check_circle" : "play_circle"}
                        size={18}
                        filled={done}
                      />
                    </span>
                    <span className="curriculum-item__body">
                      <span className="curriculum-item__title">
                        {lesson.title}
                      </span>
                      {lesson.description && (
                        <span className="curriculum-item__desc">
                          {lesson.description}
                        </span>
                      )}
                    </span>
                    <span className="curriculum-item__dur">
                      {done
                        ? "ผ่านแล้ว"
                        : formatDuration(lesson.durationSec)}
                    </span>
                  </Link>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
