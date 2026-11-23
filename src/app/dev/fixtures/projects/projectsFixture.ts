import type { MapItem, MapNodeView, Mastery, PackBlock, PackSummary, Project, ProjectSummary, ReaderPage, SessionSummary } from "@/lib/api";

// Rounded to the hour so the server and client renders of this dev page agree on every timestamp.
const hours = (h: number) => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - h * 3_600_000).toISOString();

export const MATH = "11111111-1111-4111-8111-111111111111";
export const PHYSICS = "22222222-2222-4222-8222-222222222222";
const PACK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PACK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PACK_P = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const m = (tier: Mastery["tier"], confidence: number): Mastery => ({ tier, confidence });
let ordinal = 0;
// Own link first; otherwise the nearest linked ancestor's mastery arrives through `from`, like the API resolves it.
const item = (id: string, parent_id: string | null, role: MapItem["role"], name: string, summary: string, block_ids: string[],
  link: { node_id?: string; mastery?: Mastery; from?: string } = {}): MapItem => ({
  id, parent_id, role, name, summary, block_ids, node_id: link.node_id ?? null, ordinal: ordinal++,
  mastery: link.mastery ?? null, mastery_node_id: link.mastery ? (link.node_id ?? link.from ?? null) : null,
});

// A free-depth map with the cases the UI must draw: every role, own mastery, inherited mastery, no mastery at all,
// a chapter with nothing under it, and a name too long for one line.
export const mathMap: MapItem[] = [
  item("c-quad", null, "chapter", "Phương trình bậc hai", "Chương về phương trình $ax^2+bx+c=0$.", ["b1"]),
  item("l-formula", "c-quad", "lesson", "Công thức nghiệm", "Nghiệm của phương trình bậc hai tính từ $\\Delta = b^2-4ac$.", ["b2", "b3"],
    { node_id: "math.quadratic-equation", mastery: m("intermediate", 0.62) }),
  item("k-delta", "l-formula", "concept", "Biệt thức Δ", "Δ > 0: hai nghiệm phân biệt; Δ = 0: nghiệm kép; Δ < 0: vô nghiệm.", ["b3"],
    { mastery: m("intermediate", 0.62), from: "math.quadratic-equation" }),
  item("d-delta-prime", "k-delta", "detail", "Δ′ khi hệ số b chẵn", "Với $b = 2b'$ thì $\\Delta' = b'^2 - ac$.", ["b4"],
    { mastery: m("intermediate", 0.62), from: "math.quadratic-equation" }),
  item("k-vieta", "l-formula", "concept", "Hệ thức Viète", "$x_1 + x_2 = -b/a$ và $x_1 x_2 = c/a$.", ["b5"],
    { node_id: "math.quadratic-equation.vieta", mastery: m("advanced", 0.81) }),
  item("l-reduce", "c-quad", "lesson", "Phương trình quy về bậc hai, trùng phương và chứa ẩn ở mẫu thức trong chương trình lớp chín", "Đặt ẩn phụ để đưa về bậc hai.", ["b6"]),
  item("c-sqrt", null, "chapter", "Căn bậc hai", "Căn bậc hai số học và các phép biến đổi.", ["b7"]),
  item("l-sqrt", "c-sqrt", "lesson", "Căn bậc hai số học", "$\\sqrt{A^2} = |A|$.", ["b7"], { node_id: "math.square-root", mastery: m("beginner", 0.48) }),
  item("c-function", null, "chapter", "Hàm số", "", []),
];

const physicsMap: MapItem[] = [
  item("p-electric", null, "chapter", "Điện học", "Dòng điện, điện trở và định luật Ôm.", ["pb1"]),
  item("p-ohm", "p-electric", "lesson", "Định luật Ôm", "$I = U/R$.", ["pb1", "pb2"], { node_id: "physics.ohm", mastery: m("beginner", 0.41) }),
  item("p-resistance", "p-ohm", "concept", "Điện trở", "Đại lượng cản trở dòng điện, đo bằng ôm.", ["pb2"], { mastery: m("beginner", 0.41), from: "physics.ohm" }),
];

const block = (id: string, file_id: string, page: number, ordinal: number, kind: PackBlock["kind"], text: string): PackBlock => ({ id, file_id, page, ordinal, kind, text });

const mathBlocks: PackBlock[] = [
  block("b1", "f1", 1, 0, "heading", "Phương trình bậc hai"),
  block("b2", "f1", 1, 1, "text", "Phương trình $ax^2+bx+c=0$ với $a \\neq 0$ có biệt thức $\\Delta = b^2-4ac$."),
  block("b3", "f1", 1, 2, "text", "Nếu $\\Delta > 0$ thì phương trình có hai nghiệm phân biệt $x_{1,2} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$."),
  block("b4", "f2", 2, 0, "formula", "$\\Delta' = b'^2 - ac$"),
  block("b5", "f2", 2, 1, "text", "Viète: $x_1 + x_2 = -\\frac{b}{a}$, $x_1 x_2 = \\frac{c}{a}$."),
  block("b6", "f2", 2, 2, "figure", "[Hình: đồ thị parabol cắt trục hoành tại hai điểm]"),
  block("b7", "f3", 1, 0, "heading", "Căn bậc hai số học"),
  block("b8", "f3", 1, 1, "text", "$\\sqrt{A^2} = |A|$ với mọi $A$."),
];
const physicsBlocks: PackBlock[] = [
  block("pb1", "pf1", 1, 0, "heading", "Định luật Ôm"),
  block("pb2", "pf1", 1, 1, "text", "Cường độ dòng điện $I = \\frac{U}{R}$."),
];

export const mathReader: ReaderPage[] = [
  { pack_id: PACK_A, file_id: "f1", ordinal: 0, created_at: hours(72), blocks: mathBlocks.filter(b => b.file_id === "f1") },
  { pack_id: PACK_A, file_id: "f2", ordinal: 1, created_at: hours(72), blocks: mathBlocks.filter(b => b.file_id === "f2") },
  { pack_id: PACK_B, file_id: "f3", ordinal: 0, created_at: hours(30), blocks: mathBlocks.filter(b => b.file_id === "f3") },
];
export const physicsReader: ReaderPage[] = [
  { pack_id: PACK_P, file_id: "pf1", ordinal: 0, created_at: hours(10), blocks: physicsBlocks },
];

const pack = (id: string, project_id: string, subject: { id: string; name: string }, photos: number, concepts: number, h: number): PackSummary => ({
  id, status: "ready", error: null, subject: { ...subject, by: "auto", confidence: 0.9 }, guesses: null, project_id,
  created_at: hours(h), updated_at: hours(h), photos, concepts,
});
const mathSubject = { id: "math", name: "Toán" };

export const mathProject: Project = {
  id: MATH, name: "Toán", subject_node_id: "math", map: mathMap,
  packs: [pack(PACK_B, MATH, mathSubject, 1, 2, 30), pack(PACK_A, MATH, mathSubject, 2, 5, 72)],
};
export const physicsProject: Project = {
  id: PHYSICS, name: "Vật lí", subject_node_id: "physics", map: physicsMap,
  packs: [pack(PACK_P, PHYSICS, { id: "physics", name: "Vật lí" }, 1, 2, 10)],
};

export const projectsFixture: ProjectSummary[] = [
  { id: PHYSICS, subject_node_id: "physics", name: "Vật lí", sessions: 1, packs: 1, map_nodes: physicsMap.length, last_active_at: hours(2) },
  { id: MATH, subject_node_id: "math", name: "Toán", sessions: 2, packs: 2, map_nodes: mathMap.length, last_active_at: hours(5) },
];
export const projectViews: Record<string, Project> = { [MATH]: mathProject, [PHYSICS]: physicsProject };
export const readers: Record<string, ReaderPage[]> = { [MATH]: mathReader, [PHYSICS]: physicsReader };

// GET /api/map-nodes/{id}: the node, its blocks and the packs they came from.
export function mapNodeView(id: string): MapNodeView | null {
  for (const project of Object.values(projectViews)) {
    const node = project.map.find(n => n.id === id);
    if (!node) continue;
    const all = readers[project.id].flatMap(page => page.blocks.map(b => ({ b, pack: page.pack_id })));
    const mine = all.filter(({ b }) => node.block_ids.includes(b.id));
    return { node, project_id: project.id, blocks: mine.map(x => x.b), pack_ids: [...new Set(mine.map(x => x.pack))] };
  }
  return null;
}

const session = (id: string, title: string, project_id: string | null, h: number, current = false): SessionSummary => ({
  id, title, created_at: hours(h + 1), last_active_at: hours(h), tabs: [{ phase: "solve" }], done: false, current, project_id,
});
export const sessionsFixture: SessionSummary[] = [
  session("s1", "Hai vòi nước cùng chảy đầy bể trong 6 giờ", MATH, 1, true),
  session("s2", "Tại sao bầu trời có màu xanh?", null, 3),
  session("s3", "Vật rơi từ độ cao 20 m, tính thời gian chạm đất", PHYSICS, 4),
  session("s4", "Tìm $m$ để phương trình có hai nghiệm thỏa $x_1^2 + x_2^2 = 10$", MATH, 30),
];
