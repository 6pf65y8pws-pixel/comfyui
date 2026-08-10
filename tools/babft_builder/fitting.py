"""Turn a mesh into blocks that a Build A Boat For Treasure build can reproduce.

Two strategies, both producing the same `Block` list:

* `fit_plates` follows the surface. Triangles are grown into near-flat patches and each patch
  becomes one stretched, tilted block, so curved hulls come out as a fan of angled panels
  instead of a staircase.
* `fit_voxels` fills the volume with axis-aligned blocks, merged into the largest boxes that
  fit. Better for chunky models and for anything that has to stay grid-snapped.
"""

from __future__ import annotations

import math
from array import array
from collections import deque

from .meshio import Mesh


class Block:
    """One placed block: a box of `size`, centred at `center`, with columns `u`, `v`, `n`."""

    __slots__ = ("center", "size", "u", "v", "n", "color")

    def __init__(self, center, size, u, v, n, color):
        self.center = center
        self.size = size
        self.u = u
        self.v = v
        self.n = n
        self.color = color

    def euler_xyz(self) -> tuple[float, float, float]:
        """Rotation in degrees, matching Roblox's CFrame.fromEulerAnglesXYZ order."""
        m02, m12, m22 = self.n
        m00, m10 = self.u[0], self.u[1]
        m01 = self.v[0]
        pitch = math.asin(max(-1.0, min(1.0, m02)))
        if abs(m02) < 0.99999:
            roll = math.atan2(-m12, m22)
            yaw = math.atan2(-m01, m00)
        else:
            # Straight up or down: roll and yaw fold into one angle, so keep it all in roll.
            roll = math.atan2(m10, self.v[1]) * (1.0 if m02 > 0 else -1.0)
            yaw = 0.0
        return math.degrees(roll), math.degrees(pitch), math.degrees(yaw)


def prepare(mesh: Mesh, up: str = "y", target_size: float = 40.0) -> dict:
    """Convert to Roblox axes (Y up), scale the longest side to `target_size` studs, recentre.

    The build ends up centred on X and Z with its lowest point at y = 0, so it sits on the
    ground. Returns the scale that was applied and the resulting size, for reporting.
    """
    positions = mesh.positions
    if up == "z":
        for i in range(0, len(positions), 3):
            y, z = positions[i + 1], positions[i + 2]
            positions[i + 1] = z
            positions[i + 2] = -y

    lo = [min(positions[i::3]) for i in range(3)]
    hi = [max(positions[i::3]) for i in range(3)]
    extent = [hi[i] - lo[i] for i in range(3)]
    scale = target_size / max(extent) if max(extent) > 0 else 1.0

    for i in range(0, len(positions), 3):
        positions[i] = (positions[i] - (lo[0] + hi[0]) / 2) * scale
        positions[i + 1] = (positions[i + 1] - lo[1]) * scale
        positions[i + 2] = (positions[i + 2] - (lo[2] + hi[2]) / 2) * scale

    return {"scale": scale, "size": tuple(e * scale for e in extent)}


# --- surface fitting ---------------------------------------------------------------------

def fit_plates(mesh: Mesh, thickness: float = 0.5, angle_tol: float = 20.0,
               flat_tol: float = 0.35, min_area: float = 0.25, fill: float = 2.0,
               max_blocks: int = 0) -> list[Block]:
    """Grow triangles into near-flat patches and fit one stretched, tilted block to each."""
    normals, areas, centroids = _triangle_frames(mesh)
    adjacency = _triangle_adjacency(mesh)

    for _ in range(14):
        patches = _grow_patches(mesh, normals, areas, centroids, adjacency,
                                math.cos(math.radians(angle_tol)), flat_tol, fill)
        blocks = []
        for triangles, plane_normal, plane_point in patches:
            block = _fit_patch(mesh, triangles, areas, plane_normal, plane_point, thickness, min_area)
            if block is not None:
                blocks.append(block)
        if not max_blocks or len(blocks) <= max_blocks:
            return blocks
        angle_tol *= 1.35
        flat_tol *= 1.35
        min_area *= 1.35
        fill *= 1.2
    return blocks


def _triangle_frames(mesh: Mesh):
    normals, areas, centroids = [], array("f"), array("f")
    positions = mesh.positions
    tris = mesh.tris
    for t in range(0, len(tris), 3):
        a, b, c = tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3
        ux = positions[b] - positions[a]
        uy = positions[b + 1] - positions[a + 1]
        uz = positions[b + 2] - positions[a + 2]
        vx = positions[c] - positions[a]
        vy = positions[c + 1] - positions[a + 1]
        vz = positions[c + 2] - positions[a + 2]
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        areas.append(length / 2.0)
        if length > 0:
            normals.append((nx / length, ny / length, nz / length))
        else:
            normals.append((0.0, 1.0, 0.0))
        centroids.extend(((positions[a] + positions[b] + positions[c]) / 3.0,
                          (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3.0,
                          (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3.0))
    return normals, areas, centroids


def _triangle_adjacency(mesh: Mesh) -> list[list[int]]:
    """Neighbours across shared edges, welding vertices that sit at the same spot.

    STL and many exported meshes repeat a position per triangle; without welding every face
    would end up in its own patch.
    """
    welded = _weld(mesh)
    edges: dict[tuple[int, int], int] = {}
    adjacency: list[list[int]] = [[] for _ in range(mesh.triangle_count)]
    tris = mesh.tris
    for t in range(mesh.triangle_count):
        corners = (welded[tris[t * 3]], welded[tris[t * 3 + 1]], welded[tris[t * 3 + 2]])
        for k in range(3):
            a, b = corners[k], corners[(k + 1) % 3]
            key = (a, b) if a < b else (b, a)
            other = edges.pop(key, None)
            if other is None:
                edges[key] = t
            else:
                adjacency[t].append(other)
                adjacency[other].append(t)
    return adjacency


def _weld(mesh: Mesh) -> list[int]:
    canonical: dict[tuple, int] = {}
    welded = []
    positions = mesh.positions
    for i in range(mesh.vertex_count):
        key = (round(positions[i * 3], 4), round(positions[i * 3 + 1], 4), round(positions[i * 3 + 2], 4))
        welded.append(canonical.setdefault(key, i))
    return welded


def _edge_basis(positions, tris, t, normal):
    """In-plane axes lined up with triangle `t`'s shortest edge.

    Meshes are usually built from quads split along a diagonal, and the diagonal is the long
    edge: line the axes up with a short edge and the quad's bounding box is the quad itself,
    rather than a diagonal box twice its size.
    """
    best = None
    for k in range(3):
        a = tris[t * 3 + k] * 3
        b = tris[t * 3 + (k + 1) % 3] * 3
        edge = (positions[b] - positions[a], positions[b + 1] - positions[a + 1],
                positions[b + 2] - positions[a + 2])
        length = edge[0] ** 2 + edge[1] ** 2 + edge[2] ** 2
        if best is None or (length > 0 and length < best[0]):
            best = (length, edge)

    edge = best[1]
    dot = edge[0] * normal[0] + edge[1] * normal[1] + edge[2] * normal[2]
    u = tuple(edge[i] - dot * normal[i] for i in range(3))
    length = math.sqrt(sum(c * c for c in u))
    if length < 1e-12:
        return _basis(normal)
    u = tuple(c / length for c in u)
    v = (normal[1] * u[2] - normal[2] * u[1],
         normal[2] * u[0] - normal[0] * u[2],
         normal[0] * u[1] - normal[1] * u[0])
    return u, v


def _extent(positions, tris, t, u_axis, v_axis, origin, span=None):
    """Bounds of triangle `t` in the patch plane, widened onto `span` when given."""
    lo_u, hi_u, lo_v, hi_v = span or (float("inf"), float("-inf"), float("inf"), float("-inf"))
    for k in range(3):
        i = tris[t * 3 + k] * 3
        dx = positions[i] - origin[0]
        dy = positions[i + 1] - origin[1]
        dz = positions[i + 2] - origin[2]
        u = dx * u_axis[0] + dy * u_axis[1] + dz * u_axis[2]
        v = dx * v_axis[0] + dy * v_axis[1] + dz * v_axis[2]
        lo_u, hi_u = min(lo_u, u), max(hi_u, u)
        lo_v, hi_v = min(lo_v, v), max(hi_v, v)
    return lo_u, hi_u, lo_v, hi_v


def _grow_patches(mesh, normals, areas, centroids, adjacency, cos_tol, flat_tol, fill):
    order = sorted(range(mesh.triangle_count), key=lambda t: -areas[t])
    # Degenerate triangles (poles of a UV sphere, collapsed faces) carry no normal worth
    # fitting to, so they never seed or join a patch.
    taken = bytearray(1 if areas[t] <= 0.0 else 0 for t in range(mesh.triangle_count))
    positions = mesh.positions
    tris = mesh.tris
    patches = []

    for seed in order:
        if taken[seed]:
            continue
        taken[seed] = 1
        nx, ny, nz = normals[seed]
        sum_n = [nx * areas[seed], ny * areas[seed], nz * areas[seed]]
        sum_c = [centroids[seed * 3] * areas[seed], centroids[seed * 3 + 1] * areas[seed],
                 centroids[seed * 3 + 2] * areas[seed]]
        sum_a = areas[seed]
        px, py, pz = sum_c[0] / sum_a, sum_c[1] / sum_a, sum_c[2] / sum_a
        triangles = [seed]
        # The block is a rectangle, so a patch that wanders into an L or a star would be
        # covered by a plate far bigger than the surface under it. Track the patch's extent
        # in the seed's own plane and refuse faces that would leave too much of it hanging.
        u_axis, v_axis = _edge_basis(positions, tris, seed, normals[seed])
        origin = (px, py, pz)
        span = _extent(positions, tris, seed, u_axis, v_axis, origin)
        # Breadth first, so a patch spreads evenly outwards instead of running off in a
        # strip and hitting the flatness limit after a few faces. The plane keeps moving as
        # faces join it, so faces turned away early get another look while the patch grows.
        pending = deque(adjacency[seed])
        for _ in range(4):
            deferred = deque()
            grew = False
            while pending:
                t = pending.popleft()
                if taken[t]:
                    continue
                tn = normals[t]
                if tn[0] * nx + tn[1] * ny + tn[2] * nz < cos_tol:
                    deferred.append(t)
                    continue
                offset = px * nx + py * ny + pz * nz
                far = False
                for k in range(3):
                    i = tris[t * 3 + k] * 3
                    distance = positions[i] * nx + positions[i + 1] * ny + positions[i + 2] * nz - offset
                    if abs(distance) > flat_tol:
                        far = True
                        break
                if far:
                    deferred.append(t)
                    continue

                grown = _extent(positions, tris, t, u_axis, v_axis, origin, span)
                if (grown[1] - grown[0]) * (grown[3] - grown[2]) > fill * (sum_a + areas[t]):
                    deferred.append(t)
                    continue

                span = grown
                taken[t] = 1
                grew = True
                triangles.append(t)
                weight = areas[t]
                sum_a += weight
                for axis in range(3):
                    sum_n[axis] += tn[axis] * weight
                    sum_c[axis] += centroids[t * 3 + axis] * weight
                length = math.sqrt(sum_n[0] ** 2 + sum_n[1] ** 2 + sum_n[2] ** 2)
                if length > 0:
                    nx, ny, nz = sum_n[0] / length, sum_n[1] / length, sum_n[2] / length
                px, py, pz = sum_c[0] / sum_a, sum_c[1] / sum_a, sum_c[2] / sum_a
                pending.extend(adjacency[t])

            if not grew or not deferred:
                break
            pending = deferred

        patches.append((triangles, (nx, ny, nz), (px, py, pz)))
    return patches


def _fit_patch(mesh, triangles, areas, normal, point, thickness, min_area) -> Block | None:
    u_axis, v_axis = _basis(normal)
    positions = mesh.positions
    tris = mesh.tris

    seen = set()
    flat = []
    lo = hi = None
    for t in triangles:
        for k in range(3):
            index = tris[t * 3 + k]
            if index in seen:
                continue
            seen.add(index)
            i = index * 3
            dx = positions[i] - point[0]
            dy = positions[i + 1] - point[1]
            dz = positions[i + 2] - point[2]
            flat.append((dx * u_axis[0] + dy * u_axis[1] + dz * u_axis[2],
                         dx * v_axis[0] + dy * v_axis[1] + dz * v_axis[2]))
            depth = dx * normal[0] + dy * normal[1] + dz * normal[2]
            lo = depth if lo is None or depth < lo else lo
            hi = depth if hi is None or depth > hi else hi

    rect = _min_area_rect(flat)
    if rect is None:
        return None
    (cu, cv), (width, height), (ax, ay) = rect
    if width * height < min_area:
        return None

    depth = max(hi - lo, thickness)
    offset = (hi + lo) / 2.0
    u_dir = tuple(ax * u_axis[i] + ay * v_axis[i] for i in range(3))
    v_dir = tuple(-ay * u_axis[i] + ax * v_axis[i] for i in range(3))
    center = tuple(point[i] + cu * u_axis[i] + cv * v_axis[i] + offset * normal[i] for i in range(3))

    weight = 0.0
    color = [0.0, 0.0, 0.0]
    for t in triangles:
        r, g, b = mesh.triangle_color(t)
        color[0] += r * areas[t]
        color[1] += g * areas[t]
        color[2] += b * areas[t]
        weight += areas[t]
    if weight > 0:
        color = [channel / weight for channel in color]

    return Block(center, (width, height, depth), u_dir, v_dir, normal,
                 tuple(max(0, min(255, round(channel * 255))) for channel in color))


def _basis(normal) -> tuple[tuple, tuple]:
    reference = (0.0, 0.0, 1.0) if abs(normal[1]) > 0.9 else (0.0, 1.0, 0.0)
    ux = reference[1] * normal[2] - reference[2] * normal[1]
    uy = reference[2] * normal[0] - reference[0] * normal[2]
    uz = reference[0] * normal[1] - reference[1] * normal[0]
    length = math.sqrt(ux * ux + uy * uy + uz * uz) or 1.0
    u = (ux / length, uy / length, uz / length)
    v = (normal[1] * u[2] - normal[2] * u[1],
         normal[2] * u[0] - normal[0] * u[2],
         normal[0] * u[1] - normal[1] * u[0])
    return u, v


def _convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    unique = sorted(set(points))
    if len(unique) < 3:
        return unique

    def half(source):
        chain = []
        for p in source:
            while len(chain) >= 2:
                (x1, y1), (x2, y2) = chain[-2], chain[-1]
                if (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) > 0:
                    break
                chain.pop()
            chain.append(p)
        return chain

    return half(unique)[:-1] + half(reversed(unique))[:-1]


def _min_area_rect(points):
    """Smallest-area rotated rectangle around `points`, as (centre, (w, h), unit axis)."""
    hull = _convex_hull(points)
    if len(hull) < 2:
        return None

    best = None
    for i in range(len(hull)):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % len(hull)]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < 1e-9:
            continue
        ax, ay = dx / length, dy / length
        min_u = min_v = float("inf")
        max_u = max_v = float("-inf")
        for px, py in hull:
            pu = px * ax + py * ay
            pv = -px * ay + py * ax
            min_u, max_u = min(min_u, pu), max(max_u, pu)
            min_v, max_v = min(min_v, pv), max(max_v, pv)
        area = (max_u - min_u) * (max_v - min_v)
        if best is None or area < best[0]:
            mid_u, mid_v = (min_u + max_u) / 2, (min_v + max_v) / 2
            best = (area, (mid_u * ax - mid_v * ay, mid_u * ay + mid_v * ax),
                    (max_u - min_u, max_v - min_v), (ax, ay))
    if best is None:
        return None
    return best[1], best[2], best[3]


# --- volume fitting ----------------------------------------------------------------------

def fit_voxels(mesh: Mesh, resolution: int = 40, solid: bool = False,
               merge: bool = True, colors: int = 0) -> list[Block]:
    """Voxelise the surface, optionally fill the inside, and merge cells into boxes.

    Colours are reduced here rather than afterwards: neighbouring cells only merge into one
    stretched block when they end up the same colour.
    """
    positions = mesh.positions
    lo = [min(positions[i::3]) for i in range(3)]
    hi = [max(positions[i::3]) for i in range(3)]
    step = max(hi[i] - lo[i] for i in range(3)) / resolution
    if step <= 0:
        return []
    dims = [max(1, int(math.ceil((hi[i] - lo[i]) / step))) for i in range(3)]

    cells = _rasterize(mesh, lo, step, dims)
    if solid:
        _fill_interior(cells, dims)

    flat = {key: _quantized(color) for key, color in cells.items()}
    if colors > 0:
        counts: dict[tuple[int, int, int], int] = {}
        for color in flat.values():
            counts[color] = counts.get(color, 0) + 1
        mapping = _palette_map(counts, colors)
        flat = {key: mapping[color] for key, color in flat.items()}

    blocks = []
    if merge:
        for x, y, z, sx, sy, sz, color in _greedy_boxes(flat):
            center = (lo[0] + (x + sx / 2) * step, lo[1] + (y + sy / 2) * step, lo[2] + (z + sz / 2) * step)
            blocks.append(Block(center, (sx * step, sy * step, sz * step),
                                (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), color))
    else:
        for (x, y, z), color in flat.items():
            center = (lo[0] + (x + 0.5) * step, lo[1] + (y + 0.5) * step, lo[2] + (z + 0.5) * step)
            blocks.append(Block(center, (step, step, step),
                                (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), color))
    return blocks


def _quantized(color) -> tuple[int, int, int]:
    """Averaged cell colour, rounded to 16 levels per channel so neighbours can merge."""
    count = color[3]
    return tuple(max(0, min(255, round(color[i] / count * 15) * 17)) for i in range(3))


def _rasterize(mesh: Mesh, lo, step, dims) -> dict:
    """Sample every triangle densely enough that no cell along it is missed."""
    cells: dict[tuple[int, int, int], list] = {}
    positions = mesh.positions
    tris = mesh.tris
    for t in range(mesh.triangle_count):
        a, b, c = tris[t * 3] * 3, tris[t * 3 + 1] * 3, tris[t * 3 + 2] * 3
        ax, ay, az = positions[a], positions[a + 1], positions[a + 2]
        bx, by, bz = positions[b], positions[b + 1], positions[b + 2]
        cx, cy, cz = positions[c], positions[c + 1], positions[c + 2]
        longest = max(math.dist((ax, ay, az), (bx, by, bz)),
                      math.dist((bx, by, bz), (cx, cy, cz)),
                      math.dist((cx, cy, cz), (ax, ay, az)))
        steps = max(1, min(64, int(math.ceil(longest / step * 2))))
        red, green, blue = mesh.triangle_color(t)
        for i in range(steps + 1):
            for j in range(steps + 1 - i):
                wa = i / steps
                wb = j / steps
                wc = 1.0 - wa - wb
                key = (
                    min(dims[0] - 1, max(0, int((ax * wa + bx * wb + cx * wc - lo[0]) / step))),
                    min(dims[1] - 1, max(0, int((ay * wa + by * wb + cy * wc - lo[1]) / step))),
                    min(dims[2] - 1, max(0, int((az * wa + bz * wb + cz * wc - lo[2]) / step))),
                )
                cell = cells.get(key)
                if cell is None:
                    cells[key] = [red, green, blue, 1]
                else:
                    cell[0] += red
                    cell[1] += green
                    cell[2] += blue
                    cell[3] += 1
    return cells


def _fill_interior(cells: dict, dims) -> None:
    """Flood the empty space from the outside; whatever it never reaches is inside."""
    outside = set()
    stack = []
    for x in range(dims[0]):
        for z in range(dims[2]):
            for y in (0, dims[1] - 1):
                if (x, y, z) not in cells:
                    stack.append((x, y, z))
    for y in range(dims[1]):
        for z in range(dims[2]):
            for x in (0, dims[0] - 1):
                if (x, y, z) not in cells:
                    stack.append((x, y, z))
        for x in range(dims[0]):
            for z in (0, dims[2] - 1):
                if (x, y, z) not in cells:
                    stack.append((x, y, z))

    while stack:
        x, y, z = stack.pop()
        if (x, y, z) in outside:
            continue
        outside.add((x, y, z))
        for dx, dy, dz in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
            key = (x + dx, y + dy, z + dz)
            if 0 <= key[0] < dims[0] and 0 <= key[1] < dims[1] and 0 <= key[2] < dims[2]:
                if key not in cells and key not in outside:
                    stack.append(key)

    for x in range(dims[0]):
        for y in range(dims[1]):
            for z in range(dims[2]):
                key = (x, y, z)
                if key not in cells and key not in outside:
                    cells[key] = _nearest_column_color(cells, x, y, z, dims)


def _nearest_column_color(cells, x, y, z, dims):
    for offset in range(1, dims[1]):
        for probe in (y - offset, y + offset):
            cell = cells.get((x, probe, z))
            if cell is not None:
                return list(cell)
    return [0.6, 0.6, 0.6, 1]


def _greedy_boxes(cells: dict) -> list[tuple]:
    """Merge same-colour cells into the largest axis-aligned boxes, x then y then z."""
    remaining = dict(cells)
    boxes = []
    for key in sorted(cells):
        color = remaining.get(key)
        if color is None:
            continue
        x, y, z = key
        sx = 1
        while remaining.get((x + sx, y, z)) == color:
            sx += 1
        sy = 1
        while all(remaining.get((x + i, y + sy, z)) == color for i in range(sx)):
            sy += 1
        sz = 1
        while all(remaining.get((x + i, y + j, z + sz)) == color
                  for i in range(sx) for j in range(sy)):
            sz += 1
        for i in range(sx):
            for j in range(sy):
                for k in range(sz):
                    del remaining[(x + i, y + j, z + k)]
        boxes.append((x, y, z, sx, sy, sz, color))
    return boxes


# --- shared post-processing --------------------------------------------------------------

def snap_angles(blocks: list[Block], step: float) -> None:
    """Round each block's rotation to a multiple of `step` degrees, in place."""
    if step <= 0:
        return
    for block in blocks:
        roll, pitch, yaw = (round(angle / step) * step for angle in block.euler_xyz())
        u, v, n = _matrix_from_euler(math.radians(roll), math.radians(pitch), math.radians(yaw))
        block.u, block.v, block.n = u, v, n


def _matrix_from_euler(x: float, y: float, z: float):
    cx, sx = math.cos(x), math.sin(x)
    cy, sy = math.cos(y), math.sin(y)
    cz, sz = math.cos(z), math.sin(z)
    u = (cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz)
    v = (-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz)
    n = (sy, -sx * cy, cx * cy)
    return u, v, n


def limit_palette(blocks: list[Block], count: int) -> None:
    """Reduce the block colours to `count` entries with a median cut, in place."""
    if count <= 0 or not blocks:
        return
    unique: dict[tuple[int, int, int], int] = {}
    for block in blocks:
        unique[block.color] = unique.get(block.color, 0) + 1
    if len(unique) <= count:
        return
    mapping = _palette_map(unique, count)
    for block in blocks:
        block.color = mapping[block.color]


def _palette_map(counts: dict, count: int) -> dict:
    """Median cut: split the colour cloud on its widest axis until `count` groups remain."""
    boxes = [list(counts.items())]
    while len(boxes) < count:
        target = max(boxes, key=_box_spread)
        if _box_spread(target) <= 0:
            break
        boxes.remove(target)
        axis = max(range(3), key=lambda i: max(c[i] for c, _ in target) - min(c[i] for c, _ in target))
        target.sort(key=lambda item: item[0][axis])
        half = _weighted_median(target)
        boxes.append(target[:half])
        boxes.append(target[half:])

    mapping = {}
    for box in boxes:
        total = sum(weight for _, weight in box) or 1
        average = tuple(round(sum(color[i] * weight for color, weight in box) / total) for i in range(3))
        for color, _ in box:
            mapping[color] = average
    return mapping


def _box_spread(box) -> int:
    if len(box) < 2:
        return 0
    return max(max(c[i] for c, _ in box) - min(c[i] for c, _ in box) for i in range(3))


def _weighted_median(box) -> int:
    total = sum(weight for _, weight in box)
    running = 0
    for index, (_, weight) in enumerate(box):
        running += weight
        if running * 2 >= total:
            return max(1, min(index + 1, len(box) - 1))
    return len(box) // 2
