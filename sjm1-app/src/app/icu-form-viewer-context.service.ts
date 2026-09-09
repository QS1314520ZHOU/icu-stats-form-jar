import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, map } from 'rxjs';
import { IcuFormViewerContext } from './icu-form-viewer.models';

const TZ_OFFSET_MS = 8 * 3600 * 1000;

/**
 * 解析 yyyy-MM-dd HH:mm 格式字符串为 Shanghai 时区的 Date 对象。
 * 内部按 UTC+8 解析，避免 new Date(string) 的 UTC 偏移问题。
 */
function parseShanghaiDateTime(str: string): Date | null {
  const m = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  // 按 UTC+8 构造：先算 UTC 时间，再加偏移
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0);
  return new Date(utcMs - TZ_OFFSET_MS);
}

/**
 * 解析时间戳字符串为 Date 对象。
 * 支持毫秒时间戳（13位）和秒时间戳（10位）。
 */
function parseTimestamp(str: string): Date | null {
  const num = Number(str);
  if (isNaN(num)) return null;
  // 10位及以下是秒级时间戳，需要乘以1000转为毫秒
  const ms = str.length <= 10 ? num * 1000 : num;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 将 Date 对象格式化为 ISO-8601 带 +08:00 偏移的字符串。
 */
function toIsoOffset(date: Date): string {
  const utcMs = date.getTime();
  const shanghaiMs = utcMs + TZ_OFFSET_MS;
  const d = new Date(shanghaiMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}:${s}+08:00`;
}

@Injectable({ providedIn: 'root' })
export class IcuFormViewerContextService {

  constructor(private route: ActivatedRoute) {}

  /**
   * 从 URL 查询参数生成只读上下文。
   * 正常表单路由没有 viewer=1 时，上下文不生效。
   * 支持两种时间参数格式：
   * - 时间戳格式：startTimeMs/endTimeMs（毫秒时间戳）
   * - 字符串格式：startTime/endTime（yyyy-MM-dd HH:mm 或 ISO-8601）
   */
  getContext$(): Observable<IcuFormViewerContext> {
    return this.route.queryParamMap.pipe(
      map(params => {
        const viewer = params.get('viewer');
        const startTimeStr = params.get('startTime');
        const endTimeStr = params.get('endTime');
        const startTimeMs = params.get('startTimeMs');
        const endTimeMs = params.get('endTimeMs');

        const isViewerMode = viewer === '1';

        let startInstant: Date | null = null;
        let endInstant: Date | null = null;
        let startTime: string | null = null;
        let endTime: string | null = null;

        if (isViewerMode) {
          // 优先使用时间戳格式
          if (startTimeMs) {
            startInstant = parseTimestamp(startTimeMs);
            startTime = startInstant ? startInstant.toISOString() : null;
          } else if (startTimeStr) {
            // 尝试解析 ISO 格式，再尝试 yyyy-MM-dd HH:mm 格式
            startInstant = parseTimestamp(startTimeStr) || parseShanghaiDateTime(startTimeStr);
            startTime = startTimeStr;
          }

          if (endTimeMs) {
            endInstant = parseTimestamp(endTimeMs);
            // 结束时间补到秒级末尾 59
            if (endInstant) {
              endInstant = new Date(endInstant.getTime() + 59 * 1000);
            }
            endTime = endInstant ? endInstant.toISOString() : null;
          } else if (endTimeStr) {
            endInstant = parseTimestamp(endTimeStr) || parseShanghaiDateTime(endTimeStr);
            // 结束时间补到秒级末尾 59
            if (endInstant) {
              endInstant = new Date(endInstant.getTime() + 59 * 1000);
            }
            endTime = endTimeStr;
          }
        }

        return {
          isViewerMode,
          startTime,
          endTime,
          startInstant,
          endInstant,
        };
      })
    );
  }

  /** 解析 yyyy-MM-dd HH:mm 为 Date（Shanghai 时区） */
  static parseShanghaiDateTime(str: string): Date | null {
    return parseShanghaiDateTime(str);
  }

  /** 解析时间戳为 Date */
  static parseTimestamp(str: string): Date | null {
    return parseTimestamp(str);
  }

  /** Date -> ISO-8601 +08:00 */
  static toIsoOffset(date: Date): string {
    return toIsoOffset(date);
  }

  /** Date -> 毫秒时间戳字符串 */
  static toTimestamp(date: Date): string {
    return String(date.getTime());
  }

  /** 获取当前 Shanghai 日期的 00:00 字符串 */
  static getTodayStart(): string {
    const now = new Date();
    const shanghaiMs = now.getTime() + TZ_OFFSET_MS;
    const d = new Date(shanghaiMs);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day} 00:00`;
  }

  /** 获取当前 Shanghai 日期的 23:59 字符串 */
  static getTodayEnd(): string {
    const now = new Date();
    const shanghaiMs = now.getTime() + TZ_OFFSET_MS;
    const d = new Date(shanghaiMs);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day} 23:59`;
  }
}
