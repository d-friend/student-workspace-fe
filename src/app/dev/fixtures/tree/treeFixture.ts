import type { ProgressItem, TreeNode, TreeResponse, TreeWorkspace } from "@/lib/api";

// Rounded to the hour so the server and client renders of this dev page agree on every timestamp.
const hours = (h: number) => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - h * 3_600_000).toISOString();
const node = (id: string, level: TreeNode["level"], parent_id: string | null, name: string, grades: number[], rest: Partial<TreeNode>): TreeNode =>
  ({ id, level, parent_id, name, grades, attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, packs: 0, last_seen: hours(1), ...rest });
const ws = (n: number, node_id: string, phase: TreeWorkspace["phase"], title: string, h: number, finished: boolean | null, solo: boolean | null): TreeWorkspace =>
  ({ workspace_id: `w${n}`, session_id: `s${n}`, node_id, role: "primary", phase, title, created_at: hours(h), finished, solo });

// Spec §1 example plus the edge cases the UI must draw: a hollow node (learn only), a rate of 0, a long name, a node with no grade,
// and an off-curriculum subject (Thiên văn học) that the master created by itself.
export const treeFixture: TreeResponse = {
  nodes: [
    node("math", "subject", null, "Toán", [], { attempts: 5, solo: 3, rate: 0.6, unfinished: 1, learned: 3, last_seen: hours(1) }),
    node("math.quadratic-equation", "topic", "math", "Phương trình bậc hai một ẩn", [9], { attempts: 4, solo: 2, rate: 0.5, unfinished: 1, learned: 1, last_seen: hours(1) }),
    node("math.quadratic-equation.vieta", "type", "math.quadratic-equation", "Dùng hệ thức Viète", [9], { attempts: 2, solo: 2, rate: 1, last_seen: hours(26) }),
    node("math.quadratic-equation.word-problem", "type", "math.quadratic-equation", "Giải bài toán bằng cách lập phương trình", [9], { attempts: 2, solo: 0, rate: 0, unfinished: 1, last_seen: hours(1) }),
    node("math.square-root", "topic", "math", "Căn bậc hai", [9], { learned: 2, last_seen: hours(80) }),
    node("math.sequences", "topic", "math", "Dãy số, cấp số cộng và cấp số nhân trong chương trình lớp mười một", [], { attempts: 1, solo: 0, rate: 0, last_seen: hours(200) }),
    node("physics", "subject", null, "Vật lí", [], { attempts: 1, solo: 1, rate: 1, learned: 1, last_seen: hours(40) }),
    node("physics.kinematics", "topic", "physics", "Động học", [10], { attempts: 1, solo: 1, rate: 1, last_seen: hours(40) }),
    node("physics.kinematics.free-fall", "type", "physics.kinematics", "Rơi tự do", [10], { attempts: 1, solo: 1, rate: 1, last_seen: hours(40) }),
    node("physics.light", "topic", "physics", "Ánh sáng", [], { learned: 1, last_seen: hours(120) }),
    node("thien-van-hoc", "subject", null, "Thiên văn học", [], { learned: 1, last_seen: hours(5) }),
    node("thien-van-hoc.ho-den", "topic", "thien-van-hoc", "Hố đen", [], { learned: 1, last_seen: hours(5) }),
  ],
  workspaces: [
    ws(1, "math.quadratic-equation.word-problem", "solve", "Hai vòi nước cùng chảy đầy bể trong 6 giờ", 1, false, null),
    ws(2, "math.quadratic-equation.vieta", "solve", "Tìm $m$ để phương trình có hai nghiệm $x_1, x_2$ thỏa $x_1^2 + x_2^2 = 10$", 26, true, true),
    ws(3, "math.quadratic-equation.vieta", "practice", "Cho phương trình $x^2 - 5x + 6 = 0$, tính $x_1 + x_2$", 30, true, true),
    ws(4, "math.quadratic-equation.word-problem", "solve", "Một ca nô xuôi dòng 30 km rồi ngược dòng 20 km", 50, true, false),
    ws(5, "math.quadratic-equation", "learn", "Công thức nghiệm của phương trình bậc hai", 70, null, null),
    ws(6, "math.square-root", "learn", "Căn bậc hai số học", 80, null, null),
    ws(7, "math.square-root", "learn", "Hằng đẳng thức $\\sqrt{A^2} = |A|$", 90, null, null),
    ws(8, "math.sequences", "solve", "Tìm số hạng đầu của cấp số cộng", 200, true, false),
    ws(9, "physics.kinematics.free-fall", "solve", "Vật rơi từ độ cao 20 m, tính thời gian chạm đất", 40, true, true),
    ws(10, "physics.light", "learn", "Tại sao bầu trời có màu xanh?", 120, null, null),
    ws(11, "thien-van-hoc.ho-den", "learn", "Nếu rơi vào hố đen thì chuyện gì xảy ra?", 5, null, null),
  ],
};

const card = (n: number, title: string, h: number): ProgressItem => ({
  workspace_id: `w${n}`, session_id: `s${n}`, phase: "solve", title, created_at: hours(h), tabs: 2, roadmap: "generic", stages: [0],
  steps: { entries: [{ item: 0, state: "ok", tries: 1, hint: 0 }], done: true, free: false }, quizzes: null, next: null,
});
const lesson = (n: number, title: string, h: number): ProgressItem => ({ ...card(n, title, h), phase: "learn", steps: null, quizzes: { total: 4, done: 4, first_try: 3 } });

// The activity list that goes with treeFixture, so the fixture page shows the whole progress view.
export const progressFixture: ProgressItem[] = [
  card(2, "Tìm $m$ để phương trình có hai nghiệm $x_1, x_2$ thỏa $x_1^2 + x_2^2 = 10$", 26),
  card(4, "Một ca nô xuôi dòng 30 km rồi ngược dòng 20 km", 50),
  card(9, "Vật rơi từ độ cao 20 m, tính thời gian chạm đất", 40),
  lesson(5, "Công thức nghiệm của phương trình bậc hai", 70),
  lesson(11, "Nếu rơi vào hố đen thì chuyện gì xảy ra?", 5),
];
