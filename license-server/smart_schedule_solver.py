#!/usr/bin/env python3
"""
K-SPORT Smart Schedule Pro — Phase 3 Optimization Engine
Modules:
  1. Window & Blocked-Interval Builder (splits sessions around Opening/Lunch/Closing/Locked events)
  2. Pre-Solve Lower Bound & Feasibility Analyzer
  3. Conflict Analyzer (unique athlete IDs + team members + rest gap)
  4. Greedy Initial Solution (warm-start & baseline)
  5. CP-SAT Model Builder (OR-Tools, linear/bucket ordering, full hints, strict/soft target end)
  6. Sequential Lexicographic Optimizer (per-stage metrics & bounds)
  7. Best Solution Selector (never returns a dominated CP-SAT solution over Greedy)
  8. Independent Schedule Validator & Infeasibility Diagnoser
"""

import json
import math
import sys
import time

try:
    from ortools.sat.python import cp_model
    HAS_ORTOOLS = True
except ImportError:
    HAS_ORTOOLS = False


def time_to_min(t_str):
    parts = str(t_str or "07:00").strip().split(":")
    h = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 7
    m = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return h * 60 + m


def min_to_time(mins):
    mins = int(round(mins))
    h = (mins // 60) % 24
    m = mins % 60
    return f"{h:02d}:{m:02d}"


def build_blocked_intervals(days, custom_events, mat_count):
    day_map = {d: idx for idx, d in enumerate(days)}
    blocked = {(d_idx, m): [] for d_idx in range(len(days)) for m in range(1, mat_count + 1)}

    for evt in custom_events or []:
        evt_days = [evt["date"]] if evt.get("date") and evt["date"] in day_map else days
        s_min = time_to_min(evt.get("time", "09:30"))
        dur = max(1, int(evt.get("duration", 30)))
        e_min = s_min + dur
        evt_mat = int(evt.get("mat", 0) or 0)
        target_mats = list(range(1, mat_count + 1)) if evt_mat == 0 else ([evt_mat] if 1 <= evt_mat <= mat_count else [])

        for d_str in evt_days:
            d_idx = day_map[d_str]
            base = d_idx * 1440
            for m in target_mats:
                blocked[(d_idx, m)].append({
                    "startAbs": base + s_min,
                    "endAbs": base + e_min,
                    "name": evt.get("name", "Sự kiện cố định"),
                })

    for key in blocked:
        blocked[key].sort(key=lambda x: (x["startAbs"], x["endAbs"]))
    return blocked


def subtract_blocked(start_abs, end_abs, blocked_list):
    segments = [(start_abs, end_abs)]
    for b in blocked_list:
        next_segs = []
        for s, e in segments:
            if b["endAbs"] <= s or b["startAbs"] >= e:
                next_segs.append((s, e))
            else:
                if b["startAbs"] > s:
                    next_segs.append((s, b["startAbs"]))
                if b["endAbs"] < e:
                    next_segs.append((b["endAbs"], e))
        segments = next_segs
    return [(s, e) for s, e in segments if e > s]


def build_mat_windows(
    days, session_cfg, custom_events, mat_count,
    strict_target_end=False, allow_overtime_minutes=0,
    day_session_configs=None, mat_operating_windows=None
):
    day_session_configs = day_session_configs or {}
    mat_operating_windows = mat_operating_windows or {}
    default_target_end_min = time_to_min(
        session_cfg.get("targetEndTime") or session_cfg.get("maximumEndTime") or session_cfg.get("afternoonEnd", "17:30")
    )

    blocked = build_blocked_intervals(days, custom_events, mat_count)
    mat_windows = {m: [] for m in range(1, mat_count + 1)}

    for d_idx, day in enumerate(days):
        base = d_idx * 1440
        d_cfg = {**session_cfg, **(day_session_configs.get(day) or {})}
        m_start = time_to_min(d_cfg.get("morningStart", "07:30"))
        m_end = time_to_min(d_cfg.get("morningEnd", "11:30"))
        a_start = time_to_min(d_cfg.get("afternoonStart", "13:30"))
        a_end = time_to_min(d_cfg.get("afternoonEnd", "17:30"))
        max_end_str = d_cfg.get("maximumEndTime") or d_cfg.get("afternoonEnd", "17:30")
        max_end_min = time_to_min(max_end_str)
        target_end_str = d_cfg.get("targetEndTime") or max_end_str
        target_end_min = time_to_min(target_end_str)

        raw_sessions = []
        if m_end > m_start:
            raw_sessions.append(("morning", base + m_start, base + m_end))
        if a_end > a_start:
            if strict_target_end:
                hard_a_end = base + target_end_min
            else:
                hard_a_end = base + max(max_end_min, target_end_min) + max(0, int(allow_overtime_minutes))
            if hard_a_end > base + a_start:
                raw_sessions.append(("afternoon", base + a_start, hard_a_end))

        for m in range(1, mat_count + 1):
            b_list = blocked[(d_idx, m)]
            m_op = mat_operating_windows.get(str(m)) or mat_operating_windows.get(m)
            op_s = base + time_to_min(m_op["start"]) if (m_op and m_op.get("start")) else None
            op_e = base + time_to_min(m_op["end"]) if (m_op and m_op.get("end")) else None

            for s_name, s_abs, e_abs in raw_sessions:
                eff_s = max(s_abs, op_s) if op_s is not None else s_abs
                eff_e = min(e_abs, op_e) if op_e is not None else e_abs
                if eff_e <= eff_s:
                    continue
                for seg_s, seg_e in subtract_blocked(eff_s, eff_e, b_list):
                    mat_windows[m].append({
                        "dayIndex": d_idx,
                        "date": day,
                        "session": s_name,
                        "startAbs": seg_s,
                        "endAbs": seg_e,
                        "targetEndAbs": base + target_end_min,
                    })

    return mat_windows, blocked, default_target_end_min


def get_conflict_pairs(categories):
    athlete_to_cats = {}
    for idx, cat in enumerate(categories):
        for ath in cat.get("athletes", []):
            key = str(ath).strip().lower()
            if not key:
                continue
            athlete_to_cats.setdefault(key, []).append(idx)

    conflicts = {i: set() for i in range(len(categories))}
    for idxs in athlete_to_cats.values():
        if len(idxs) > 1:
            for i in idxs:
                for j in idxs:
                    if i != j:
                        conflicts[i].add(j)
    return conflicts, athlete_to_cats


def get_allowed_mats(cat, mat_count):
    raw = cat.get("allowedMats")
    if isinstance(raw, list) and len(raw) > 0:
        return sorted(set(max(1, min(mat_count, int(m))) for m in raw))
    return list(range(1, mat_count + 1))


def get_preferred_mats(cat, allowed):
    raw = cat.get("preferredMats")
    if isinstance(raw, list) and len(raw) > 0:
        return [m for m in raw if m in allowed]
    return []


def compute_lower_bounds(categories, mat_windows, mat_count, athlete_to_cats, min_rest, transition_min, target_end_min):
    """Pre-solve mathematical lower bounds & bottleneck diagnostics (Section 4)."""
    total_dur = sum(max(5, int(c.get("duration", 15))) for c in categories)
    total_dur_with_tr = sum(max(5, int(c.get("duration", 15))) + transition_min for c in categories)

    per_mat_cap_to_target = {}
    for m in range(1, mat_count + 1):
        cap = 0
        for w in mat_windows[m]:
            t_end = (w["dayIndex"] * 1440) + target_end_min
            if w["startAbs"] < t_end:
                cap += max(0, min(w["endAbs"], t_end) - w["startAbs"])
        per_mat_cap_to_target[m] = cap

    total_cap_to_target = sum(per_mat_cap_to_target.values())

    # Minimum restricted load per mat (categories that ONLY allow 1 mat)
    forced_load = {m: 0 for m in range(1, mat_count + 1)}
    for c in categories:
        allowed = get_allowed_mats(c, mat_count)
        if len(allowed) == 1:
            forced_load[allowed[0]] += max(5, int(c.get("duration", 15))) + transition_min

    # Longest athlete conflict chain
    longest_athlete_chain = 0
    for ath_id, idxs in athlete_to_cats.items():
        if len(idxs) > 1:
            chain = sum(max(5, int(categories[i].get("duration", 15))) for i in idxs) + (len(idxs) - 1) * min_rest
            if chain > longest_athlete_chain:
                longest_athlete_chain = chain

    all_wins = [w for wins in mat_windows.values() for w in wins]
    min_start = min([w["startAbs"] for w in all_wins], default=0)
    max_single_dur = max([max(5, int(c.get("duration", 15))) for c in categories], default=0)

    # Lower bound on total active work time needed per mat
    avg_work_lb = math.ceil(total_dur / max(1, mat_count))
    makespan_work_lb = max(max_single_dur, avg_work_lb, longest_athlete_chain)

    # Map active work lower bound onto earliest mat windows (accounting for breaks like Khai mạc / Nghỉ trưa)
    # Use Mat 1's windows as representative timeline to estimate earliest clock finish
    rep_wins = sorted(mat_windows[1], key=lambda w: w["startAbs"]) if mat_windows.get(1) else []
    rem = avg_work_lb
    lb_clock = min_start + makespan_work_lb
    for w in rep_wins:
        w_len = w["endAbs"] - w["startAbs"]
        if rem <= w_len:
            lb_clock = w["startAbs"] + rem
            rem = 0
            break
        rem -= w_len

    return {
        "totalDurationMinutes": total_dur,
        "totalDurationWithTransitionMinutes": total_dur_with_tr,
        "totalCapacityToTargetMinutes": total_cap_to_target,
        "perMatCapacityToTarget": per_mat_cap_to_target,
        "forcedLoadPerMat": forced_load,
        "longestAthleteChainMinutes": longest_athlete_chain,
        "makespanLowerBoundTime": min_to_time(lb_clock % 1440) if all_wins else "—",
        "feasibleWithinTargetLikely": total_dur <= total_cap_to_target,
    }


def greedy_initial_schedule(
    categories, mat_windows, mat_count, conflicts, min_rest, transition_min,
    kata_mode="per_mat_kata_first"
):
    assignments = {}
    mat_busy = {m: [] for m in range(1, mat_count + 1)}

    all_dates = sorted({w["date"]: w["dayIndex"] for m_wins in mat_windows.values() for w in m_wins}.items(), key=lambda x: x[1])
    date_to_idx = dict(all_dates)

    for idx, cat in enumerate(categories):
        pin = cat.get("pinned")
        if pin and pin.get("date") in date_to_idx and pin.get("mat") and pin.get("startTime"):
            d_idx = date_to_idx[pin["date"]]
            s_abs = d_idx * 1440 + time_to_min(pin["startTime"])
            dur = max(5, int(cat.get("duration", 15)))
            m = max(1, min(mat_count, int(pin["mat"])))
            assignments[idx] = {
                "mat": m,
                "startAbs": s_abs,
                "endAbs": s_abs + dur,
                "dayIndex": d_idx,
                "date": pin["date"],
                "pinned": True,
            }
            mat_busy[m].append((s_abs, s_abs + dur + transition_min, idx))

    remaining = [i for i in range(len(categories)) if i not in assignments]
    remaining.sort(key=lambda i: (
        int(categories[i].get("phaseGroup", 0)),
        int(categories[i].get("ageOrder", 99)),
        int(categories[i].get("intraAgeRank", 99)),
        int(categories[i].get("priorityRank", i)),
    ))

    global_kata_end = 0

    for idx in remaining:
        cat = categories[idx]
        dur = max(5, int(cat.get("duration", 15)))
        allowed = get_allowed_mats(cat, mat_count)
        preferred = set(get_preferred_mats(cat, allowed))
        is_kumite = (cat.get("discipline") == "kumite")

        if kata_mode == "global_kata_first" and is_kumite:
            kata_ends = [a["endAbs"] for j, a in assignments.items() if not a.get("pinned") and categories[j].get("discipline") == "kata"]
            if kata_ends:
                global_kata_end = max(global_kata_end, max(kata_ends))

        best_slot = None
        mat_order = sorted(
            allowed,
            key=lambda m: (
                0 if (not preferred or m in preferred) else 1,
                max([e for _, e, _ in mat_busy[m]], default=0),
            ),
        )

        allowed_days = set(cat["allowedDays"]) if isinstance(cat.get("allowedDays"), list) and cat["allowedDays"] else None
        allowed_sessions = set(cat["allowedSessions"]) if isinstance(cat.get("allowedSessions"), list) and cat["allowedSessions"] else None

        for m in mat_order:
            for w in mat_windows[m]:
                if allowed_days and w["date"] not in allowed_days:
                    continue
                if allowed_sessions and w["session"] not in allowed_sessions:
                    continue
                if w["endAbs"] - w["startAbs"] < dur:
                    continue

                min_s = w["startAbs"]
                if kata_mode == "global_kata_first" and is_kumite:
                    min_s = max(min_s, global_kata_end)
                elif kata_mode == "per_mat_kata_first" and is_kumite:
                    mat_kata_ends = [a["endAbs"] for j, a in assignments.items() if a["mat"] == m and a["dayIndex"] == w["dayIndex"] and categories[j].get("discipline") == "kata"]
                    if mat_kata_ends:
                        min_s = max(min_s, max(mat_kata_ends))

                if min_s + dur > w["endAbs"]:
                    continue

                candidates = {min_s}
                for s, e_tr, _ in mat_busy[m]:
                    if min_s <= e_tr <= w["endAbs"] - dur:
                        candidates.add(e_tr)
                for c_idx in conflicts[idx]:
                    if c_idx in assignments:
                        c_end = assignments[c_idx]["endAbs"] + min_rest
                        if min_s <= c_end <= w["endAbs"] - dur:
                            candidates.add(c_end)

                for cand_s in sorted(candidates):
                    cand_e = cand_s + dur
                    if cand_e > w["endAbs"]:
                        continue
                    cand_e_tr = cand_e + transition_min
                    if any(not (cand_e_tr <= s or cand_s >= e_tr) for s, e_tr, _ in mat_busy[m]):
                        continue

                    conflict_hit = False
                    for c_idx in conflicts[idx]:
                        if c_idx in assignments:
                            ca = assignments[c_idx]
                            if not (cand_e + min_rest <= ca["startAbs"] or cand_s >= ca["endAbs"] + min_rest):
                                conflict_hit = True
                                break
                    if conflict_hit:
                        continue

                    overtime_pen = max(0, cand_e - w["targetEndAbs"]) * 100
                    pref_pen = 0 if (not preferred or m in preferred) else 50
                    score = overtime_pen + cand_e * 10 + pref_pen
                    if best_slot is None or score < best_slot[0]:
                        best_slot = (score, m, cand_s, cand_e, w["dayIndex"], w["date"])
                    break

        if best_slot is not None:
            _, m, s_abs, e_abs, d_idx, d_str = best_slot
            assignments[idx] = {
                "mat": m,
                "startAbs": s_abs,
                "endAbs": e_abs,
                "dayIndex": d_idx,
                "date": d_str,
                "pinned": False,
            }
            mat_busy[m].append((s_abs, e_abs + transition_min, idx))

    return assignments


def diagnose_infeasibility(categories, mat_windows, mat_count, min_rest, transition_min, lower_bounds=None):
    reasons = []
    suggestions = []

    max_win_per_mat = {
        m: max([w["endAbs"] - w["startAbs"] for w in mat_windows[m]], default=0)
        for m in range(1, mat_count + 1)
    }
    for cat in categories:
        allowed = get_allowed_mats(cat, mat_count)
        if not allowed:
            reasons.append(f"Nội dung '{cat['name']}' không có thảm hợp lệ do bị cấm ở tất cả các thảm.")
            suggestions.append(f"Mở lại ít nhất 1 thảm cho '{cat['name']}'.")
            continue
        dur = max(5, int(cat.get("duration", 15)))
        best_win = max(max_win_per_mat[m] for m in allowed)
        if dur > best_win:
            reasons.append(f"Nội dung '{cat['name']}' cần {dur} phút nhưng khoảng liên tục dài nhất trên thảm cho phép chỉ có {best_win} phút.")
            suggestions.append("Kéo dài giờ kết thúc hoặc chia nhỏ sơ đồ đấu.")

    total_work = sum(max(5, int(c.get("duration", 15))) + transition_min for c in categories)
    total_cap = sum(sum(w["endAbs"] - w["startAbs"] for w in mat_windows[m]) for m in range(1, mat_count + 1))
    if total_work > total_cap:
        reasons.append(f"Tổng thời lượng thi đấu ({total_work} phút) vượt quá tổng quỹ thời gian của {mat_count} thảm ({total_cap} phút).")
        suggestions.append(f"Tăng từ {mat_count} lên {mat_count + 1} thảm hoặc kéo dài giờ kết thúc.")

    for disc in ("kata", "kumite"):
        disc_cats = [c for c in categories if c.get("discipline") == disc]
        if not disc_cats:
            continue
        disc_work = sum(max(5, int(c.get("duration", 15))) + transition_min for c in disc_cats)
        disc_mats = set()
        for c in disc_cats:
            disc_mats.update(get_allowed_mats(c, mat_count))
        disc_cap = sum(sum(w["endAbs"] - w["startAbs"] for w in mat_windows[m]) for m in disc_mats)
        if disc_work > disc_cap:
            reasons.append(f"Nhóm {disc.upper()} cần {disc_work} phút nhưng các thảm được phép ({sorted(disc_mats)}) chỉ có {disc_cap} phút.")
            suggestions.append(f"Cho phép thêm thảm thi đấu {disc.upper()}.")

    if not reasons:
        reasons.append("Các ràng buộc bắt buộc (khung giờ, thảm cho phép, giờ nghỉ VĐV, ghim tay) xung đột đồng thời.")
        suggestions.append("Kiểm tra giờ kết thúc bắt buộc, tăng số thảm, hoặc chuyển thứ tự sang 'Ưu tiên'.")

    return {"suspectedReasons": reasons[:6], "suggestions": list(dict.fromkeys(suggestions))[:5], "lowerBounds": lower_bounds}


def validate_schedule(categories, assignments, mat_windows, blocked, mat_count, conflicts, min_rest, transition_min, target_end_min, manual_schedule_raw=None):
    n = len(categories)
    mat_overlaps = 0
    athlete_overlaps = 0
    rest_violations = 0
    blocked_violations = 0
    mat_rule_violations = 0
    pinned_violations = 0
    issues = []

    scheduled_count = len(assignments)
    missing_count = max(0, n - scheduled_count)
    if missing_count > 0:
        issues.append(f"Thiếu {missing_count} nội dung chưa được xếp.")

    by_mat = {m: [] for m in range(1, mat_count + 1)}
    age_mats = {}
    manual_disruptions = 0

    for i, a in assignments.items():
        m = a["mat"]
        by_mat[m].append((a["startAbs"], a["endAbs"], i))

        age_key = categories[i].get("ageOrder", 99)
        age_mats.setdefault(age_key, set()).add(m)

        if manual_schedule_raw:
            ms = manual_schedule_raw.get(categories[i]["id"])
            if ms and (int(ms.get("mat", 0)) != m or ms.get("time") != min_to_time(a["startAbs"] % 1440)):
                manual_disruptions += 1

        allowed = get_allowed_mats(categories[i], mat_count)
        if m not in allowed:
            mat_rule_violations += 1
            issues.append(f"{categories[i]['name']}: Xếp vào Thảm {m} (ngoài thảm cho phép {allowed}).")

        for b in blocked.get((a["dayIndex"], m), []):
            if not (a["endAbs"] <= b["startAbs"] or a["startAbs"] >= b["endAbs"]):
                blocked_violations += 1
                issues.append(f"{categories[i]['name']}: Chồng lấn '{b['name']}' trên Thảm {m}.")

        pin = categories[i].get("pinned")
        if pin and pin.get("date") and pin.get("mat") and pin.get("startTime"):
            if int(pin["mat"]) != m or pin["date"] != a["date"] or min_to_time(a["startAbs"] % 1440) != pin["startTime"]:
                pinned_violations += 1
                issues.append(f"{categories[i]['name']}: Bị thay đổi so với vị trí đã ghim.")

    for m, items in by_mat.items():
        items.sort()
        for k in range(len(items) - 1):
            if items[k][1] + transition_min > items[k + 1][0]:
                mat_overlaps += 1
                issues.append(f"Thảm {m}: Chồng lấn thời gian giữa '{categories[items[k][2]]['name']}' và '{categories[items[k + 1][2]]['name']}'.")

    seen = set()
    athlete_mat_switches = 0
    for i in range(n):
        if i not in assignments:
            continue
        for j in conflicts[i]:
            if j not in assignments:
                continue
            pair = (min(i, j), max(i, j))
            if pair in seen:
                continue
            seen.add(pair)
            a1, a2 = assignments[pair[0]], assignments[pair[1]]
            if a1["mat"] != a2["mat"]:
                athlete_mat_switches += 1
            if not (a1["endAbs"] <= a2["startAbs"] or a2["endAbs"] <= a1["startAbs"]):
                athlete_overlaps += 1
                issues.append(f"Trùng VĐV: '{categories[pair[0]]['name']}' vs '{categories[pair[1]]['name']}'.")
            elif min_rest > 0 and not (a1["endAbs"] + min_rest <= a2["startAbs"] or a2["endAbs"] + min_rest <= a1["startAbs"]):
                rest_violations += 1
                issues.append(f"Thiếu giờ nghỉ (<{min_rest}p): '{categories[pair[0]]['name']}' & '{categories[pair[1]]['name']}'.")

    mat_loads = []
    workloads = []
    completion_times = []
    total_idle = 0
    max_end_abs = 0
    overtime_minutes = 0
    sum_end_abs = sum(a["endAbs"] for a in assignments.values())

    for m in range(1, mat_count + 1):
        items = sorted(by_mat[m])
        work_min = sum(e - s for s, e, _ in items)
        workloads.append(work_min)
        last_end = max([e for _, e, _ in items], default=0)
        first_start = min([s for s, _, _ in items], default=0)
        if last_end > max_end_abs:
            max_end_abs = last_end
        if items:
            completion_times.append(last_end % 1440)
            day_target = (last_end // 1440) * 1440 + target_end_min
            overtime_minutes = max(overtime_minutes, max(0, last_end - day_target))
            span = last_end - first_start
            blocked_inside = sum(
                max(0, min(last_end, b["endAbs"]) - max(first_start, b["startAbs"]))
                for d_idx in set(a["dayIndex"] for _, _, idx in items for a in [assignments[idx]])
                for b in blocked.get((d_idx, m), [])
            )
            idle_m = max(0, span - work_min - blocked_inside)
            total_idle += idle_m
        else:
            idle_m = 0

        avail_cap = sum(min(w["endAbs"], (w["dayIndex"] * 1440 + target_end_min)) - w["startAbs"] for w in mat_windows[m] if w["startAbs"] < (w["dayIndex"] * 1440 + target_end_min))
        util_pct = round(min(100.0, (work_min / max(1, avail_cap)) * 100.0), 1)
        mat_loads.append({
            "mat": m,
            "categoryCount": len(items),
            "totalMinutes": work_min,
            "idleMinutes": idle_m,
            "lastEndTime": min_to_time(last_end % 1440) if last_end > 0 else "—",
            "utilizationPercent": util_pct,
        })

    mean_w = sum(workloads) / len(workloads) if workloads else 0
    var_w = sum((x - mean_w) ** 2 for x in workloads) / len(workloads) if workloads else 0
    workload_std_dev = round(math.sqrt(var_w), 1)
    completion_spread = (max(completion_times) - min(completion_times)) if len(completion_times) > 1 else 0
    age_dispersion = sum(max(0, len(ms) - 1) for ms in age_mats.values())
    hard_violations = mat_overlaps + athlete_overlaps + blocked_violations + mat_rule_violations + pinned_violations + missing_count

    return {
        "valid": hard_violations == 0,
        "validationScope": "category_level",
        "hardViolations": hard_violations,
        "scheduledCount": scheduled_count,
        "unscheduledCount": missing_count,
        "totalCategories": n,
        "totalMatches": sum(int(c.get("matchCount", 0)) for c in categories),
        "matOverlaps": mat_overlaps,
        "athleteOverlaps": athlete_overlaps,
        "athleteMatSwitches": athlete_mat_switches,
        "ageDispersion": age_dispersion,
        "manualDisruptions": manual_disruptions,
        "restViolations": rest_violations,
        "blockedViolations": blocked_violations,
        "matRuleViolations": mat_rule_violations,
        "pinnedViolations": pinned_violations,
        "issues": issues[:20],
        "makespanAbs": max_end_abs,
        "makespanTime": min_to_time(max_end_abs % 1440) if max_end_abs > 0 else "—",
        "sumEndMinutes": sum_end_abs,
        "completionSpreadMinutes": completion_spread,
        "overtimeMinutes": overtime_minutes,
        "totalIdleMinutes": total_idle,
        "workloadStdDevMinutes": workload_std_dev,
        "matLoads": mat_loads,
    }


def strategy_score_tuple(val, strategy):
    """Exact lexicographic comparison tuple for Best Solution Selector (lower is better)."""
    if strategy == "balanced_time":
        return (
            val["hardViolations"],
            val["overtimeMinutes"],
            val["makespanAbs"],
            val["completionSpreadMinutes"],
            val["totalIdleMinutes"],
            val["athleteMatSwitches"],
            val["manualDisruptions"],
        )
    if strategy == "earliest_finish":
        return (
            val["hardViolations"],
            val["overtimeMinutes"],
            val["makespanAbs"],
            val["sumEndMinutes"],
            val["completionSpreadMinutes"],
            val["athleteMatSwitches"],
        )
    if strategy == "athlete_experience":
        return (
            val["hardViolations"],
            val["overtimeMinutes"],
            val["athleteMatSwitches"],
            val["makespanAbs"],
            val["completionSpreadMinutes"],
        )
    if strategy == "minimal_disruption":
        return (
            val["hardViolations"],
            val["manualDisruptions"],
            val["overtimeMinutes"],
            val["makespanAbs"],
            val["completionSpreadMinutes"],
        )
    # organization_priority
    return (
        val["hardViolations"],
        val["overtimeMinutes"],
        val["makespanAbs"],
        val["athleteMatSwitches"],
        val["ageDispersion"],
        val["completionSpreadMinutes"],
        val["manualDisruptions"],
    )


def solve_cpsat_strategy(
    categories, mat_windows, mat_count, conflicts, min_rest, transition_min,
    greedy_sol, greedy_valid, kata_mode="per_mat_kata_first", intra_age_mode="preferred",
    strategy="balanced_time", max_seconds=10.0, target_end_min=960, workers=2,
    manual_schedule_raw=None, days=None
):
    n = len(categories)
    if n == 0:
        return {"status": "OPTIMAL", "schedule": {}, "stages": [], "lexicographicProven": True}

    for cat in categories:
        if not get_allowed_mats(cat, mat_count):
            return {
                "status": "INFEASIBLE",
                "diagnosis": diagnose_infeasibility(categories, mat_windows, mat_count, min_rest, transition_min),
            }

    model = cp_model.CpModel()
    all_wins = [w for wins in mat_windows.values() for w in wins]
    if not all_wins:
        return {
            "status": "INFEASIBLE",
            "diagnosis": {"suspectedReasons": ["Không có khung giờ thi đấu hợp lệ."], "suggestions": ["Kiểm tra lại giờ Sáng/Chiều."]},
        }

    min_abs = min(w["startAbs"] for w in all_wins)
    max_abs = max(w["endAbs"] for w in all_wins)

    start_vars = []
    end_vars = []
    mat_vars = []
    mat_bool_map = {}
    mat_intervals = {m: [] for m in range(1, mat_count + 1)}
    overtime_vars = []
    soft_penalties = []

    for i, cat in enumerate(categories):
        dur = max(5, int(cat.get("duration", 15)))
        dur_tr = dur + transition_min
        allowed = get_allowed_mats(cat, mat_count)
        preferred = set(get_preferred_mats(cat, allowed))
        g = greedy_sol.get(i) if greedy_valid else None

        if g and g.get("pinned"):
            s_v = model.NewConstant(g["startAbs"])
            e_v = model.NewConstant(g["endAbs"])
            m_v = model.NewConstant(g["mat"])
            start_vars.append(s_v)
            end_vars.append(e_v)
            mat_vars.append(m_v)
            iv = model.NewFixedSizeIntervalVar(g["startAbs"], dur_tr, f"pin_{i}")
            mat_intervals[g["mat"]].append(iv)
            continue

        s_v = model.NewIntVar(min_abs, max_abs, f"s_{i}")
        e_v = model.NewIntVar(min_abs + dur, max_abs + dur, f"e_{i}")
        model.Add(e_v == s_v + dur)
        m_v = model.NewIntVarFromDomain(cp_model.Domain.FromValues(allowed), f"m_{i}")
        start_vars.append(s_v)
        end_vars.append(e_v)
        mat_vars.append(m_v)

        wm_bools = []
        mat_to_wm_bools = {m: [] for m in allowed}
        allowed_days = set(cat["allowedDays"]) if isinstance(cat.get("allowedDays"), list) and cat["allowedDays"] else None
        allowed_sessions = set(cat["allowedSessions"]) if isinstance(cat.get("allowedSessions"), list) and cat["allowedSessions"] else None

        for m in allowed:
            for w_idx, w in enumerate(mat_windows[m]):
                if allowed_days and w["date"] not in allowed_days:
                    continue
                if allowed_sessions and w["session"] not in allowed_sessions:
                    continue
                if w["endAbs"] - w["startAbs"] < dur:
                    continue
                b = model.NewBoolVar(f"wm_{i}_{m}_{w_idx}")
                model.Add(m_v == m).OnlyEnforceIf(b)
                model.Add(s_v >= w["startAbs"]).OnlyEnforceIf(b)
                model.Add(e_v <= w["endAbs"]).OnlyEnforceIf(b)
                wm_bools.append(b)
                mat_to_wm_bools[m].append(b)
                if g:
                    in_seg = (g["mat"] == m and w["startAbs"] <= g["startAbs"] and g["endAbs"] <= w["endAbs"])
                    model.AddHint(b, 1 if in_seg else 0)

        if not wm_bools:
            return {
                "status": "INFEASIBLE",
                "diagnosis": diagnose_infeasibility(categories, mat_windows, mat_count, min_rest, transition_min),
            }
        model.AddExactlyOne(wm_bools)

        for m in allowed:
            mb = model.NewBoolVar(f"mat_{i}_{m}")
            model.Add(m_v == m).OnlyEnforceIf(mb)
            model.Add(m_v != m).OnlyEnforceIf(mb.Not())
            model.Add(sum(mat_to_wm_bools[m]) == mb) if mat_to_wm_bools[m] else model.Add(mb == 0)
            e_tr_v = model.NewIntVar(min_abs + dur_tr, max_abs + dur_tr, f"etr_{i}_{m}")
            model.Add(e_tr_v == s_v + dur_tr)
            iv = model.NewOptionalIntervalVar(s_v, dur_tr, e_tr_v, mb, f"iv_{i}_{m}")
            mat_intervals[m].append(iv)
            mat_bool_map[(i, m)] = mb
            if g:
                model.AddHint(mb, 1 if g["mat"] == m else 0)
            if preferred and m not in preferred:
                soft_penalties.append(mb * 60)

        day_target = (g["dayIndex"] * 1440 + target_end_min) if g else target_end_min
        ov = model.NewIntVar(0, max_abs, f"ov_{i}")
        model.Add(ov >= e_v - day_target)
        overtime_vars.append(ov)

        if g:
            model.AddHint(s_v, g["startAbs"])
            model.AddHint(m_v, g["mat"])

    # Hard Constraint: NoOverlap per mat
    for m in range(1, mat_count + 1):
        if len(mat_intervals[m]) > 1:
            model.AddNoOverlap(mat_intervals[m])

    # Hard Constraint: Athlete ID conflict + minRestMinutes
    seen_pairs = set()
    for i in range(n):
        for j in conflicts[i]:
            pair = (min(i, j), max(i, j))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            a, b = pair
            order = model.NewBoolVar(f"ord_{a}_{b}")
            model.Add(end_vars[a] + min_rest <= start_vars[b]).OnlyEnforceIf(order)
            model.Add(end_vars[b] + min_rest <= start_vars[a]).OnlyEnforceIf(order.Not())

            # Penalize athlete mat switching (especially in organization_priority, lightly in balanced)
            same_m = model.NewBoolVar(f"same_m_{a}_{b}")
            model.Add(mat_vars[a] == mat_vars[b]).OnlyEnforceIf(same_m)
            model.Add(mat_vars[a] != mat_vars[b]).OnlyEnforceIf(same_m.Not())
            sw_weight = 400 if strategy == "athlete_experience" else (150 if strategy == "organization_priority" else 30)
            soft_penalties.append(same_m.Not() * sw_weight)

    # Karate Rule 5.1: Kata vs Kumite
    if kata_mode == "global_kata_first":
        kata_ends = [end_vars[i] for i in range(n) if categories[i].get("discipline") == "kata" and not (greedy_valid and greedy_sol.get(i, {}).get("pinned"))]
        kumite_starts = [start_vars[i] for i in range(n) if categories[i].get("discipline") == "kumite" and not (greedy_valid and greedy_sol.get(i, {}).get("pinned"))]
        if kata_ends and kumite_starts:
            kata_barrier = model.NewIntVar(min_abs, max_abs + 240, "kata_barrier")
            model.AddMaxEquality(kata_barrier, kata_ends)
            for ks in kumite_starts:
                model.Add(ks >= kata_barrier)
    elif kata_mode == "per_mat_kata_first":
        for i in range(n):
            if categories[i].get("discipline") != "kata" or (greedy_valid and greedy_sol.get(i, {}).get("pinned")):
                continue
            for j in range(n):
                if categories[j].get("discipline") != "kumite" or (greedy_valid and greedy_sol.get(j, {}).get("pinned")):
                    continue
                common = set(get_allowed_mats(categories[i], mat_count)) & set(get_allowed_mats(categories[j], mat_count))
                for m in common:
                    mi = mat_bool_map.get((i, m))
                    mj = mat_bool_map.get((j, m))
                    if mi is not None and mj is not None:
                        model.Add(end_vars[i] <= start_vars[j]).OnlyEnforceIf([mi, mj])

    # Intra-age required constraints (hard only when intra_age_mode == "required")
    if intra_age_mode == "required":
        for i in range(n):
            if greedy_valid and greedy_sol.get(i, {}).get("pinned"):
                continue
            ai = int(categories[i].get("ageOrder", 99))
            ri = int(categories[i].get("intraAgeRank", 99))
            di = categories[i].get("discipline")
            for j in range(n):
                if i == j or (greedy_valid and greedy_sol.get(j, {}).get("pinned")):
                    continue
                if ai == int(categories[j].get("ageOrder", 99)) and di == categories[j].get("discipline") and ri < int(categories[j].get("intraAgeRank", 99)):
                    model.Add(start_vars[i] <= start_vars[j])

    # Linear O(N) Karate order & age preference (replaces O(N^2) age_inv booleans for fast propagation!)
    if strategy == "organization_priority" or intra_age_mode == "preferred":
        max_rank = max(1, n)
        for i in range(n):
            if greedy_valid and greedy_sol.get(i, {}).get("pinned"):
                continue
            rank = int(categories[i].get("priorityRank", i))
            w_order = max(1, (max_rank - rank) * (4 if strategy == "organization_priority" else 1))
            # Prefer earlier ranks to start earlier without quadratic boolean blowup
            soft_penalties.append((start_vars[i] - min_abs) * max(1, w_order // 10))

    # Makespan, Overtime, Completion Spread
    makespan = model.NewIntVar(min_abs, max_abs + 240, "makespan")
    model.AddMaxEquality(makespan, end_vars)

    max_overtime = model.NewIntVar(0, max_abs, "max_overtime")
    if overtime_vars:
        model.AddMaxEquality(max_overtime, overtime_vars)
    else:
        model.Add(max_overtime == 0)

    mat_end_vars = []
    for m in range(1, mat_count + 1):
        m_end = model.NewIntVar(min_abs, max_abs + 240, f"mend_{m}")
        cand_ends = [min_abs]
        for i in range(n):
            g = greedy_sol.get(i) if greedy_valid else None
            if g and g.get("pinned"):
                if g["mat"] == m:
                    cand_ends.append(end_vars[i])
            else:
                mb = mat_bool_map.get((i, m))
                if mb is not None:
                    e_m = model.NewIntVar(min_abs, max_abs + 240, f"em_{i}_{m}")
                    model.Add(e_m == end_vars[i]).OnlyEnforceIf(mb)
                    model.Add(e_m == min_abs).OnlyEnforceIf(mb.Not())
                    cand_ends.append(e_m)
        model.AddMaxEquality(m_end, cand_ends)
        mat_end_vars.append(m_end)

    max_mat_end = model.NewIntVar(min_abs, max_abs + 240, "max_mat_end")
    min_mat_end = model.NewIntVar(min_abs, max_abs + 240, "min_mat_end")
    model.AddMaxEquality(max_mat_end, mat_end_vars)
    model.AddMinEquality(min_mat_end, mat_end_vars)
    completion_spread = model.NewIntVar(0, max_abs + 240, "completion_spread")
    model.Add(completion_spread == max_mat_end - min_mat_end)

    # Sequential Lexicographic Optimization
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = max(1, min(4, int(workers)))
    status_map = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "UNKNOWN",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
    }

    total_budget = max(2.0, float(max_seconds))
    budget_a = max(0.8, total_budget * 0.20)
    budget_b = max(1.0, total_budget * 0.30)
    budget_c = max(1.2, total_budget * 0.50)

    stages_report = []

    def run_stage(stage_name, obj_name, obj_expr, budget):
        t_st = time.time()
        model.Minimize(obj_expr)
        solver.parameters.max_time_in_seconds = budget
        st = solver.Solve(model)
        st_str = status_map.get(st, "UNKNOWN")
        rt_ms = int((time.time() - t_st) * 1000)
        if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            ov = round(solver.ObjectiveValue(), 2)
            bb = round(solver.BestObjectiveBound(), 2)
            gap = round(abs(ov - bb) / max(1.0, abs(ov)) * 100.0, 2) if st == cp_model.FEASIBLE else 0.0
        else:
            ov, bb, gap = None, None, None
        stages_report.append({
            "stageName": stage_name,
            "objectiveName": obj_name,
            "status": st_str,
            "objectiveValue": ov,
            "bestBound": bb,
            "gapPercent": gap,
            "runtimeMs": rt_ms,
            "provenOptimal": st_str == "OPTIMAL",
        })
        return st, st_str

    def extract_and_hint():
        sol = {}
        model.ClearHints()
        for i in range(n):
            s_val = int(solver.Value(start_vars[i]))
            e_val = int(solver.Value(end_vars[i]))
            m_val = int(solver.Value(mat_vars[i]))
            d_idx = s_val // 1440
            d_str = mat_windows[m_val][0]["date"]
            for w in mat_windows[m_val]:
                if w["dayIndex"] == d_idx:
                    d_str = w["date"]
                    break
            sol[i] = {
                "mat": m_val,
                "startAbs": s_val,
                "endAbs": e_val,
                "dayIndex": d_idx,
                "date": d_str,
                "pinned": bool(greedy_valid and greedy_sol.get(i, {}).get("pinned", False)),
            }
            if not sol[i]["pinned"]:
                model.AddHint(start_vars[i], s_val)
                model.AddHint(mat_vars[i], m_val)
                for m_cand in get_allowed_mats(categories[i], mat_count):
                    mb = mat_bool_map.get((i, m_cand))
                    if mb is not None:
                        model.AddHint(mb, 1 if m_cand == m_val else 0)
        return sol

    # Stage A: Overtime
    sum_ov = model.NewIntVar(0, max_abs * max(1, len(overtime_vars)), "sum_ov")
    model.Add(sum_ov == (sum(overtime_vars) if overtime_vars else 0))
    st_a, st_a_str = run_stage("Stage 1: Overtime", "max_overtime*1000 + sum_overtime", max_overtime * 1000 + sum_ov, budget_a)
    if st_a not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        diag = diagnose_infeasibility(categories, mat_windows, mat_count, min_rest, transition_min) if st_a == cp_model.INFEASIBLE else None
        return {"status": st_a_str, "diagnosis": diag, "stages": stages_report, "lexicographicProven": False}

    best_sol = extract_and_hint()
    model.Add(max_overtime <= int(solver.Value(max_overtime)))
    model.Add(sum_ov <= int(solver.Value(sum_ov)))

    # Stage B: Makespan
    st_b, st_b_str = run_stage("Stage 2: Makespan", "makespan", makespan, budget_b)
    if st_b in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_sol = extract_and_hint()
        model.Add(makespan <= int(solver.Value(makespan)))

    # Minimal disruption penalties when preserving existing manual schedule
    disruption_vars = []
    if strategy == "minimal_disruption" and manual_schedule_raw and days:
        day_idx_map = {d: idx for idx, d in enumerate(days)}
        for i, cat in enumerate(categories):
            if greedy_valid and greedy_sol.get(i, {}).get("pinned"):
                continue
            ms = manual_schedule_raw.get(cat["id"])
            if ms and ms.get("date") in day_idx_map and ms.get("mat") and ms.get("time"):
                target_s = day_idx_map[ms["date"]] * 1440 + time_to_min(ms["time"])
                target_m = max(1, min(mat_count, int(ms["mat"])))
                kept = model.NewBoolVar(f"kept_{i}")
                model.Add(start_vars[i] == target_s).OnlyEnforceIf(kept)
                model.Add(mat_vars[i] == target_m).OnlyEnforceIf(kept)
                disruption_vars.append(kept.Not())

    # Stage C: Strategy Secondary
    if strategy == "balanced_time":
        sec_name = "completion_spread*1000 + sum(end_vars) + soft_penalties"
        sec_expr = completion_spread * 1000 + sum(end_vars) + (sum(soft_penalties) if soft_penalties else 0)
    elif strategy == "earliest_finish":
        sec_name = "sum(end_vars)*10 + completion_spread*100 + soft_penalties"
        sec_expr = sum(end_vars) * 10 + completion_spread * 100 + (sum(soft_penalties) if soft_penalties else 0)
    elif strategy == "athlete_experience":
        sec_name = "athlete_switches_and_rest + sum(end_vars) + completion_spread*100"
        sec_expr = (sum(soft_penalties) * 10 if soft_penalties else 0) + sum(end_vars) + completion_spread * 100
    elif strategy == "minimal_disruption":
        sec_name = "manual_disruptions*2000 + completion_spread*100 + sum(end_vars)"
        sec_expr = (sum(disruption_vars) * 2000 if disruption_vars else 0) + completion_spread * 100 + sum(end_vars) + (sum(soft_penalties) if soft_penalties else 0)
    else:
        sec_name = "soft_penalties*5 + completion_spread*100 + sum(end_vars)"
        sec_expr = (sum(soft_penalties) * 5 if soft_penalties else 0) + completion_spread * 100 + sum(end_vars)

    st_c, st_c_str = run_stage("Stage 3: Secondary", sec_name, sec_expr, budget_c)
    if st_c in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_sol = extract_and_hint()

    lex_proven = all(s["provenOptimal"] for s in stages_report)
    overall_status = "OPTIMAL" if lex_proven else "FEASIBLE"

    return {
        "status": overall_status,
        "lexicographicProven": lex_proven,
        "stages": stages_report,
        "schedule": best_sol,
    }


def format_schedule_map(categories, assignments):
    out = {}
    for i, cat in enumerate(categories):
        a = assignments.get(i)
        if not a:
            continue
        out[cat["id"]] = {
            "mat": a["mat"],
            "date": a["date"],
            "time": min_to_time(a["startAbs"] % 1440),
            "endTime": min_to_time(a["endAbs"] % 1440),
            "duration": a["endAbs"] - a["startAbs"],
            "pinned": bool(a.get("pinned", False)),
        }
    return out


def main():
    t0 = time.time()
    payload = json.loads(sys.stdin.read() or "{}")

    categories = payload.get("categories", [])
    days = payload.get("tournamentDays", [])
    mat_count = max(1, int(payload.get("matCount", 4)))
    session_cfg = payload.get("sessionConfig", {})
    custom_events = payload.get("customEvents", [])
    manual_schedule_raw = payload.get("manualSchedule") or {}
    min_rest = max(0, int(payload.get("minRestMinutes", 20)))
    transition_min = max(0, int(payload.get("transitionMinutes", 0)))
    max_seconds = float(payload.get("maxTimeSeconds", 30.0))
    kata_mode = payload.get("kataMode", "per_mat_kata_first")
    intra_age_mode = payload.get("intraAgeMode", "preferred")
    multi_plan = bool(payload.get("multiPlan", True))
    require_cpsat = bool(payload.get("requireCpSat", False))
    strict_target_end = bool(payload.get("strictTargetEndTime", False))
    day_session_configs = payload.get("daySessionConfigs") or None
    mat_operating_windows = payload.get("matOperatingWindows") or None
    selected_strategies = payload.get("selectedStrategies") or None
    workers = int(payload.get("workers", 2))

    if not categories or not days:
        print(json.dumps({"success": False, "message": "Thiếu danh sách nội dung hoặc ngày thi đấu."}))
        return

    if require_cpsat and not HAS_ORTOOLS:
        print(json.dumps({
            "success": False,
            "hasOrtools": False,
            "solverStatus": "MODEL_INVALID",
            "errorCode": "ORTOOLS_UNAVAILABLE",
            "message": "Google OR-Tools CP-SAT không khả dụng trong môi trường Python hiện tại (requireCpSat=true).",
        }, ensure_ascii=False))
        return

    mat_windows, blocked, target_end_min = build_mat_windows(
        days, session_cfg, custom_events, mat_count,
        strict_target_end=strict_target_end,
        day_session_configs=day_session_configs,
        mat_operating_windows=mat_operating_windows,
    )
    conflicts, athlete_to_cats = get_conflict_pairs(categories)
    lower_bounds = compute_lower_bounds(
        categories, mat_windows, mat_count, athlete_to_cats, min_rest, transition_min, target_end_min
    )

    manual_validation = None
    if manual_schedule_raw:
        day_idx_map = {d: idx for idx, d in enumerate(days)}
        manual_assigns = {}
        for i, cat in enumerate(categories):
            slot = manual_schedule_raw.get(cat["id"])
            if slot and slot.get("date") in day_idx_map and slot.get("mat") and slot.get("time"):
                d_idx = day_idx_map[slot["date"]]
                s_abs = d_idx * 1440 + time_to_min(slot["time"])
                dur = max(5, int(cat.get("duration", 15)))
                manual_assigns[i] = {
                    "mat": max(1, min(mat_count, int(slot["mat"]))),
                    "startAbs": s_abs,
                    "endAbs": s_abs + dur,
                    "dayIndex": d_idx,
                    "date": slot["date"],
                    "pinned": bool(slot.get("pinned", False)),
                }
        manual_validation = validate_schedule(
            categories, manual_assigns, mat_windows, blocked, mat_count, conflicts, min_rest, transition_min, target_end_min, manual_schedule_raw
        )

    # Stage 1: Greedy Algorithm
    greedy_sol = greedy_initial_schedule(
        categories, mat_windows, mat_count, conflicts, min_rest, transition_min, kata_mode=kata_mode
    )
    greedy_validation = validate_schedule(
        categories, greedy_sol, mat_windows, blocked, mat_count, conflicts, min_rest, transition_min, target_end_min, manual_schedule_raw
    )

    all_strategies = {
        "balanced_time": ("balanced_time", "Phương án – Cân bằng thời gian", "Tối ưu giờ kết thúc và giảm chênh lệch giữa các thảm"),
        "earliest_finish": ("earliest_finish", "Phương án – Kết thúc sớm nhất", "Ưu tiên hoàn thành toàn giải sớm nhất có thể"),
        "organization_priority": ("organization_priority", "Phương án – Thuận tiện công tác tổ chức", "Tập trung lứa tuổi, giữ trình tự Karate và giảm VĐV đổi thảm"),
        "athlete_experience": ("athlete_experience", "Phương án – Ưu tiên trải nghiệm VĐV", "Hạn chế tối đa VĐV phải chuyển thảm và tối ưu nhịp nghỉ"),
        "minimal_disruption": ("minimal_disruption", "Phương án – Giữ lịch hiện tại", "Hạn chế tối đa thay đổi so với lịch đã xếp hiện tại"),
    }
    if isinstance(selected_strategies, list) and len(selected_strategies) > 0:
        strategies = [all_strategies[sid] for sid in selected_strategies if sid in all_strategies]
        if not strategies:
            strategies = [all_strategies["balanced_time"]]
    elif multi_plan:
        strategies = [
            all_strategies["balanced_time"],
            all_strategies["earliest_finish"],
            all_strategies["organization_priority"],
        ]
    else:
        strategies = [all_strategies["balanced_time"]]

    plans = []
    seen_signatures = set()
    primary_status = "UNKNOWN"
    primary_diagnosis = None
    per_plan_budget = max(2.5, max_seconds / len(strategies))

    if HAS_ORTOOLS:
        for strat_id, strat_title, strat_desc in strategies:
            res = solve_cpsat_strategy(
                categories, mat_windows, mat_count, conflicts, min_rest, transition_min,
                greedy_sol, greedy_validation["valid"], kata_mode=kata_mode, intra_age_mode=intra_age_mode,
                strategy=strat_id, max_seconds=per_plan_budget, target_end_min=target_end_min, workers=workers,
                manual_schedule_raw=manual_schedule_raw, days=days
            )
            if strat_id == "balanced_time":
                primary_status = res["status"]
                primary_diagnosis = res.get("diagnosis")

            chosen_sol = None
            chosen_val = None
            chosen_engine = None
            chosen_status = res["status"]
            chosen_lex_proven = res.get("lexicographicProven", False)
            chosen_stages = res.get("stages", [])

            if res["status"] in ("OPTIMAL", "FEASIBLE"):
                cpsat_val = validate_schedule(
                    categories, res["schedule"], mat_windows, blocked, mat_count, conflicts, min_rest, transition_min, target_end_min, manual_schedule_raw
                )
                if cpsat_val["valid"]:
                    chosen_sol = res["schedule"]
                    chosen_val = cpsat_val
                    chosen_engine = f"ortools-cp-sat ({res['status']})"

            # Best Solution Selector: never return a dominated CP-SAT solution over valid Greedy!
            if greedy_validation["valid"]:
                if chosen_sol is None:
                    chosen_sol = greedy_sol
                    chosen_val = greedy_validation
                    chosen_engine = "greedy (best-found)"
                    chosen_status = "FEASIBLE"
                    chosen_lex_proven = False
                else:
                    g_score = strategy_score_tuple(greedy_validation, strat_id)
                    c_score = strategy_score_tuple(chosen_val, strat_id)
                    if g_score <= c_score:
                        chosen_sol = greedy_sol
                        chosen_val = greedy_validation
                        chosen_engine = "greedy (best-found · không bị CP-SAT vượt)"
                        chosen_status = "FEASIBLE"
                        chosen_lex_proven = False

            if chosen_sol is not None and chosen_val is not None:
                sig = tuple((i, chosen_sol[i]["mat"], chosen_sol[i]["startAbs"]) for i in sorted(chosen_sol))
                if sig not in seen_signatures:
                    seen_signatures.add(sig)
                    last_stage = chosen_stages[-1] if chosen_stages else {}
                    plans.append({
                        "id": strat_id,
                        "title": strat_title,
                        "description": strat_desc,
                        "status": chosen_status,
                        "lexicographicProven": chosen_lex_proven,
                        "stages": chosen_stages,
                        "engine": chosen_engine,
                        "objectiveValue": last_stage.get("objectiveValue"),
                        "bestBound": last_stage.get("bestBound"),
                        "gapPercent": last_stage.get("gapPercent"),
                        "schedule": format_schedule_map(categories, chosen_sol),
                        "validation": chosen_val,
                    })
    else:
        primary_status = "FEASIBLE" if greedy_validation["valid"] else "UNKNOWN"
        if greedy_validation["valid"]:
            plans.append({
                "id": "greedy_only",
                "title": "Phương án Greedy (Chưa có OR-Tools)",
                "description": "Chạy ở môi trường chưa cài Google OR-Tools; kết quả từ thuật toán Greedy",
                "status": "FEASIBLE",
                "lexicographicProven": False,
                "stages": [],
                "engine": "greedy-no-ortools",
                "objectiveValue": None,
                "bestBound": None,
                "gapPercent": None,
                "schedule": format_schedule_map(categories, greedy_sol),
                "validation": greedy_validation,
            })

    elapsed_ms = int((time.time() - t0) * 1000)
    used_fallback = not HAS_ORTOOLS
    print(json.dumps({
        "success": len(plans) > 0,
        "hasOrtools": HAS_ORTOOLS,
        "usedFallback": used_fallback,
        "fallbackNotice": "Đang dùng Greedy Fallback do máy chủ chưa cài Google OR-Tools CP-SAT." if used_fallback else None,
        "solverStatus": primary_status,
        "lowerBounds": lower_bounds,
        "diagnosis": primary_diagnosis,
        "elapsedMs": elapsed_ms,
        "plans": plans,
        "greedyBaseline": {
            "validation": greedy_validation,
            "schedule": format_schedule_map(categories, greedy_sol),
        },
        "manualBaseline": {
            "validation": manual_validation,
        } if manual_validation else None,
        "message": None if len(plans) > 0 else (
            primary_diagnosis["suspectedReasons"][0]
            if primary_diagnosis and primary_diagnosis.get("suspectedReasons")
            else f"Không tìm được lịch hợp lệ (Trạng thái solver: {primary_status})."
        ),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
