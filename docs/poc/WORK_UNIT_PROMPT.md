# Prompt dùng cho từng session Codex

## Prompt chuẩn

Thay `WU-NN` bằng unit được giao. Với repo đích đã có code, không chạy lại scaffold chỉ vì bắt đầu session mới.

Backend changes luôn đọc [BACKEND_STANDARDS.md](../engineering/BACKEND_STANDARDS.md) và [apps/api/AGENTS.md](../../apps/api/AGENTS.md). Sau POC, nhiệm vụ refactor dùng phase/read-set/gates trong [BACKEND_REFACTOR_PLAN.md](../engineering/BACKEND_REFACTOR_PLAN.md), không tự tạo WU-37 hoặc mở lại WU cũ. Yêu cầu chỉ lập kế hoạch/lưu tài liệu thì deliverable là docs đã kiểm chứng; không tự bắt đầu sửa runtime.

```text
Implement WU-NN from docs/poc/work-units/WU-NN.md.

Before editing:
1. Read AGENTS.md, docs/poc/PROGRESS.md, the assigned work-unit file,
   and only its relevant read-set.
   For backend-related changes also read apps/api/AGENTS.md and
   docs/engineering/BACKEND_STANDARDS.md.
2. Inspect the current implementation and previous progress.
3. Verify that the work unit's prerequisites are already complete.
4. Give a concise 3–7 step implementation plan.

Then implement the plan immediately in this same session.

Rules:
- Do not implement later work units.
- Do not perform unrelated refactors.
- Follow existing project conventions and the agreed architecture.
- POC limits feature scope, not architecture/code/test quality.
- Backend changes must meet BACKEND_STANDARDS and its risk-based gates;
  preserve final D1 guards, Undo/idempotency and R2 outcome semantics.
- Add only tests needed for this work unit.
- Use TypeScript, pnpm, and the established Turborepo workspace.
- Use Tailwind from the first React component; preserve exact source tokens.
- Reuse the existing primitive/business component before creating another.
- Keep API DTOs, mock and HTTP adapters consistent.
- If the handoff conflicts with real code or an installed API, document
  the conflict and resolve only what is required in the current scope.
  Do not silently redesign or bypass a required gate.
- Do not change the reference commit or generate goldens from the target.
- Continue independently unless there is a real blocker.

Before ending:
1. Run the relevant tests/typecheck/build and the unit's required
   visual, interaction or local D1/R2 checks.
2. Fix failures caused by this work.
3. Update docs/poc/PROGRESS.md with completed acceptance criteria,
   changed files, verification commands/results, evidence, decisions,
   blockers, and the next permitted unit.
4. Commit all changes belonging to this work unit and push main on
   the configured user-owned target repository, following AGENTS.md.
   Do not include unrelated user changes or push the reference upstream.
   If push is unavailable, retain the implemented/tested work and report
   the exact push blocker; do not claim it succeeded.
5. Report Completed, Verification, Files changed, Decisions/conflicts,
   Blockers, Commit, Push, and Next.
6. Stop. Do not begin the next unit.

Respond in Vietnamese.
```

## Tiếp tục unit chưa hoàn thành

```text
Continue WU-NN from the current code and docs/poc/PROGRESS.md.
Do not restart completed work. Inspect the existing evidence and blocker,
verify prerequisites, give a concise 3–7 step plan, then complete only
the remaining scope immediately. Run the necessary verification,
update PROGRESS.md, commit/push the work-unit changes as configured,
report the result in Vietnamese, and stop.
```

## Cách đánh giá kết quả session

`DONE` cần đủ acceptance criteria và evidence thực tế. Một danh sách component đã tạo hoặc câu “build pass” chưa chứng minh pixel-perfect. Với UI phải có source/target/diff/scenario; với D1/R2 phải có actual binding/integration evidence khi unit yêu cầu.

Không bắt đầu unit tiếp theo khi prerequisite còn `IN_PROGRESS/BLOCKED`. File PROGRESS là bộ nhớ xuyên session, nhưng phải đối chiếu với implementation và commit hiện tại. Không tự đánh dấu hoàn thành từ lời tóm tắt một session khác.

## Thứ tự sử dụng bộ tài liệu

1. Đặt bộ handoff vào repo đích đã chọn; xác định branch/remote và giữ code người dùng hiện có.
2. Giao WU-00. Unit này dựng reference harness tối thiểu nếu target chưa có tooling.
3. Sau khi WU-00 đạt gate, mở session mới giao WU-01. Chỉ tăng số unit khi PROGRESS và code checkpoint chứng minh đã đủ điều kiện.
4. Dừng xem POC ở WU-12; tiếp tục full UI tới WU-29 khi cần toàn bộ source; chạy backend WU-30…36 theo roadmap.

Đây là prompt thực thi repo, không tạo automation tự chạy nhiều session hoặc tự merge/deploy.
