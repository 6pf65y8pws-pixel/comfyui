"""Mesh loading for the block builder: OBJ, STL, PLY, GLB and glTF.

Stdlib only. PNG textures are decoded here with zlib so a GLB exported from ComfyUI works
without extra packages; Pillow is used instead when it is installed, which also covers JPEG.
"""

from __future__ import annotations

import base64
import json
import os
import struct
import sys
import zlib
from array import array

_LITTLE_ENDIAN = sys.byteorder == "little"


class Texture:
    __slots__ = ("width", "height", "pixels")

    def __init__(self, width: int, height: int, pixels: bytes):
        self.width = width
        self.height = height
        self.pixels = pixels  # tightly packed RGB, top row first

    def sample(self, u: float, v: float) -> tuple[float, float, float]:
        x = int(u * self.width) % self.width
        y = int(v * self.height) % self.height
        i = (y * self.width + x) * 3
        p = self.pixels
        return p[i] / 255.0, p[i + 1] / 255.0, p[i + 2] / 255.0


class Material:
    __slots__ = ("color", "texture")

    def __init__(self, color=(0.8, 0.8, 0.8), texture: Texture | None = None):
        self.color = color
        self.texture = texture


class Mesh:
    """Triangle soup with optional per-vertex colours, UVs and per-triangle materials.

    Positions are a flat array of x, y, z; tris a flat array of vertex indices.
    """

    def __init__(self):
        self.positions = array("f")
        self.tris = array("i")
        self.uvs: array | None = None
        self.colors: array | None = None
        self.tri_material: array | None = None
        self.materials: list[Material] = []

    @property
    def triangle_count(self) -> int:
        return len(self.tris) // 3

    @property
    def vertex_count(self) -> int:
        return len(self.positions) // 3

    def vertex(self, i: int) -> tuple[float, float, float]:
        p = self.positions
        i *= 3
        return p[i], p[i + 1], p[i + 2]

    def triangle_color(self, t: int) -> tuple[float, float, float]:
        """Average surface colour of triangle `t`, in 0..1 RGB."""
        material = self.materials[self.tri_material[t]] if self.tri_material else None
        base = material.color if material else (0.8, 0.8, 0.8)
        texture = material.texture if material else None
        r = g = b = 0.0
        for k in range(3):
            i = self.tris[t * 3 + k]
            cr, cg, cb = base
            if self.colors is not None:
                cr *= self.colors[i * 3]
                cg *= self.colors[i * 3 + 1]
                cb *= self.colors[i * 3 + 2]
            if texture is not None and self.uvs is not None:
                tr, tg, tb = texture.sample(self.uvs[i * 2], self.uvs[i * 2 + 1])
                cr *= tr
                cg *= tg
                cb *= tb
            r += cr
            g += cg
            b += cb
        return r / 3.0, g / 3.0, b / 3.0


def load(path: str) -> Mesh:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".obj":
        return _load_obj(path)
    if ext == ".stl":
        return _load_stl(path)
    if ext == ".ply":
        return _load_ply(path)
    if ext in (".glb", ".gltf"):
        return _load_gltf(path)
    raise ValueError(f"unsupported mesh format: {ext or path}")


# --- images ------------------------------------------------------------------------------

def decode_image(data: bytes) -> Texture | None:
    """Decode PNG/JPEG bytes to a Texture, or None when the format is not readable here."""
    try:
        from PIL import Image  # noqa: PLC0415 - optional, only worth importing when used
        from io import BytesIO

        image = Image.open(BytesIO(data)).convert("RGB")
        return Texture(image.width, image.height, image.tobytes())
    except ImportError:
        pass
    except Exception:
        return None
    return _decode_png(data)


_PNG_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _decode_png(data: bytes) -> Texture | None:
    if data[:8] != b"\x89PNG\r\n\x1a\x0a":
        return None
    pos = 8
    width = height = depth = color_type = interlace = 0
    palette = b""
    idat = bytearray()
    while pos + 8 <= len(data):
        length, kind = struct.unpack_from(">I4s", data, pos)
        pos += 8
        chunk = data[pos:pos + length]
        pos += length + 4
        if kind == b"IHDR":
            width, height, depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"PLTE":
            palette = chunk
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    channels = _PNG_CHANNELS.get(color_type)
    if channels is None or depth != 8 or interlace or not idat:
        return None

    stride = width * channels
    raw = zlib.decompress(bytes(idat))
    rows = _unfilter_png(raw, height, stride, channels)

    if color_type == 2:
        return Texture(width, height, bytes(rows))
    out = bytearray(width * height * 3)
    for i in range(width * height):
        src = i * channels
        if color_type == 3:
            j = rows[src] * 3
            out[i * 3:i * 3 + 3] = palette[j:j + 3]
        elif color_type in (0, 4):
            grey = rows[src]
            out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = grey
        else:  # RGBA
            out[i * 3:i * 3 + 3] = rows[src:src + 3]
    return Texture(width, height, bytes(out))


def _unfilter_png(raw: bytes, height: int, stride: int, bpp: int) -> bytearray:
    out = bytearray(height * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        method = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if method == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif method == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif method == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif method == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                upleft = prev[i - bpp] if i >= bpp else 0
                up = prev[i]
                p = left + up - upleft
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upleft)
                if pa <= pb and pa <= pc:
                    line[i] = (line[i] + left) & 0xFF
                elif pb <= pc:
                    line[i] = (line[i] + up) & 0xFF
                else:
                    line[i] = (line[i] + upleft) & 0xFF
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return out


# --- OBJ ---------------------------------------------------------------------------------

def _load_obj(path: str) -> Mesh:
    mesh = Mesh()
    positions: list[tuple[float, float, float]] = []
    vertex_colors: list[tuple[float, float, float]] = []
    texcoords: list[tuple[float, float]] = []
    materials: dict[str, int] = {}
    cache: dict[tuple[int, int], int] = {}
    uvs = array("f")
    colors = array("f")
    tri_material = array("i")
    current = -1
    has_uv = has_color = False

    def emit(vi: int, ti: int) -> int:
        nonlocal has_uv, has_color
        key = (vi, ti)
        index = cache.get(key)
        if index is not None:
            return index
        index = len(mesh.positions) // 3
        mesh.positions.extend(positions[vi])
        uvs.extend(texcoords[ti] if 0 <= ti < len(texcoords) else (0.0, 0.0))
        colors.extend(vertex_colors[vi] if vi < len(vertex_colors) else (1.0, 1.0, 1.0))
        has_uv = has_uv or 0 <= ti < len(texcoords)
        has_color = has_color or vi < len(vertex_colors)
        cache[key] = index
        return index

    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            parts = line.split()
            if not parts:
                continue
            tag = parts[0]
            if tag == "v":
                positions.append((float(parts[1]), float(parts[2]), float(parts[3])))
                if len(parts) >= 7:
                    vertex_colors.append((float(parts[4]), float(parts[5]), float(parts[6])))
            elif tag == "vt":
                # OBJ texture space has its origin bottom-left; flip to match image rows.
                texcoords.append((float(parts[1]), 1.0 - float(parts[2])))
            elif tag == "f":
                corners = []
                for token in parts[1:]:
                    fields = token.split("/")
                    vi = int(fields[0])
                    vi = vi - 1 if vi > 0 else len(positions) + vi
                    ti = -1
                    if len(fields) > 1 and fields[1]:
                        ti = int(fields[1])
                        ti = ti - 1 if ti > 0 else len(texcoords) + ti
                    corners.append(emit(vi, ti))
                for k in range(1, len(corners) - 1):
                    mesh.tris.extend((corners[0], corners[k], corners[k + 1]))
                    tri_material.append(max(current, 0))
            elif tag == "usemtl":
                name = parts[1]
                if name not in materials:
                    materials[name] = len(mesh.materials)
                    mesh.materials.append(Material())
                current = materials[name]
            elif tag == "mtllib":
                _load_mtl(os.path.join(os.path.dirname(path), " ".join(parts[1:])), mesh, materials)

    if not mesh.materials:
        mesh.materials.append(Material())
    mesh.tri_material = tri_material
    if has_uv:
        mesh.uvs = uvs
    if has_color:
        mesh.colors = colors
    return mesh


def _load_mtl(path: str, mesh: Mesh, materials: dict[str, int]) -> None:
    if not os.path.exists(path):
        return
    current: Material | None = None
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            parts = line.split()
            if not parts:
                continue
            if parts[0] == "newmtl":
                name = parts[1]
                if name not in materials:
                    materials[name] = len(mesh.materials)
                    mesh.materials.append(Material())
                current = mesh.materials[materials[name]]
            elif current is None:
                continue
            elif parts[0] == "Kd" and len(parts) >= 4:
                current.color = (float(parts[1]), float(parts[2]), float(parts[3]))
            elif parts[0] == "map_Kd":
                image_path = os.path.join(os.path.dirname(path), parts[-1])
                if os.path.exists(image_path):
                    with open(image_path, "rb") as image_file:
                        current.texture = decode_image(image_file.read())


# --- STL ---------------------------------------------------------------------------------

def _load_stl(path: str) -> Mesh:
    with open(path, "rb") as handle:
        data = handle.read()

    mesh = Mesh()
    mesh.materials.append(Material())
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if 84 + count * 50 == len(data):
            for t in range(count):
                offset = 84 + t * 50 + 12
                mesh.positions.extend(struct.unpack_from("<9f", data, offset))
                mesh.tris.extend((t * 3, t * 3 + 1, t * 3 + 2))
            return mesh

    corner = 0
    for line in data.decode("utf-8", errors="replace").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[0] == "vertex":
            mesh.positions.extend((float(parts[1]), float(parts[2]), float(parts[3])))
            corner += 1
            if corner == 3:
                base = len(mesh.positions) // 3 - 3
                mesh.tris.extend((base, base + 1, base + 2))
                corner = 0
    return mesh


# --- PLY ---------------------------------------------------------------------------------

_PLY_TYPES = {
    "char": ("b", 1), "int8": ("b", 1), "uchar": ("B", 1), "uint8": ("B", 1),
    "short": ("h", 2), "int16": ("h", 2), "ushort": ("H", 2), "uint16": ("H", 2),
    "int": ("i", 4), "int32": ("i", 4), "uint": ("I", 4), "uint32": ("I", 4),
    "float": ("f", 4), "float32": ("f", 4), "double": ("d", 8), "float64": ("d", 8),
}


def _load_ply(path: str) -> Mesh:
    with open(path, "rb") as handle:
        data = handle.read()

    header_end = data.find(b"end_header")
    if header_end < 0:
        raise ValueError(f"not a PLY file: {path}")
    body = data[data.index(b"\n", header_end) + 1:]
    header = data[:header_end].decode("ascii", errors="replace").splitlines()

    binary = False
    elements: list[tuple[str, int, list]] = []
    for line in header:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "format":
            if parts[1] == "binary_big_endian":
                raise ValueError("big-endian PLY files are not supported")
            binary = parts[1].startswith("binary")
        elif parts[0] == "element":
            elements.append((parts[1], int(parts[2]), []))
        elif parts[0] == "property" and elements:
            if parts[1] == "list":
                elements[-1][2].append(("list", parts[2], parts[3], parts[4]))
            else:
                elements[-1][2].append(("scalar", parts[1], parts[2]))

    mesh = Mesh()
    mesh.materials.append(Material())
    colors = array("f")
    has_color = False
    offset = 0
    ascii_fields: list[str] = body.decode("ascii", errors="replace").split() if not binary else []
    cursor = 0

    for name, count, properties in elements:
        for _ in range(count):
            values: dict[str, float] = {}
            indices: list[int] = []
            for prop in properties:
                if prop[0] == "scalar":
                    _, ptype, pname = prop
                    if binary:
                        fmt, size = _PLY_TYPES[ptype]
                        values[pname] = struct.unpack_from("<" + fmt, body, offset)[0]
                        offset += size
                    else:
                        values[pname] = float(ascii_fields[cursor])
                        cursor += 1
                else:
                    _, count_type, item_type, _pname = prop
                    if binary:
                        cfmt, csize = _PLY_TYPES[count_type]
                        n = struct.unpack_from("<" + cfmt, body, offset)[0]
                        offset += csize
                        ifmt, isize = _PLY_TYPES[item_type]
                        indices = list(struct.unpack_from("<" + ifmt * n, body, offset))
                        offset += isize * n
                    else:
                        n = int(float(ascii_fields[cursor]))
                        cursor += 1
                        indices = [int(float(v)) for v in ascii_fields[cursor:cursor + n]]
                        cursor += n
            if name == "vertex":
                mesh.positions.extend((values.get("x", 0.0), values.get("y", 0.0), values.get("z", 0.0)))
                if "red" in values:
                    has_color = True
                    colors.extend((values["red"] / 255.0, values["green"] / 255.0, values["blue"] / 255.0))
                else:
                    colors.extend((1.0, 1.0, 1.0))
            elif name == "face":
                for k in range(1, len(indices) - 1):
                    mesh.tris.extend((indices[0], indices[k], indices[k + 1]))

    if has_color:
        mesh.colors = colors
    return mesh


# --- glTF / GLB --------------------------------------------------------------------------

_GLTF_COMPONENTS = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
                    5125: ("I", 4), 5126: ("f", 4)}
_GLTF_TYPE_SIZE = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
_GLTF_NORMALIZE = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}


def _load_gltf(path: str) -> Mesh:
    with open(path, "rb") as handle:
        data = handle.read()

    binary_chunk = b""
    if data[:4] == b"glTF":
        _, _, _total = struct.unpack_from("<4sII", data, 0)
        offset = 12
        gltf = {}
        while offset + 8 <= len(data):
            length, kind = struct.unpack_from("<II", data, offset)
            chunk = data[offset + 8:offset + 8 + length]
            offset += 8 + length
            if kind == 0x4E4F534A:
                gltf = json.loads(chunk.decode("utf-8"))
            elif kind == 0x004E4942:
                binary_chunk = chunk
    else:
        gltf = json.loads(data.decode("utf-8"))

    base_dir = os.path.dirname(path)
    buffers = [_read_buffer(buffer, base_dir, binary_chunk) for buffer in gltf.get("buffers", [])]
    if not buffers:
        buffers = [binary_chunk]

    mesh = Mesh()
    uvs = array("f")
    colors = array("f")
    tri_material = array("i")
    material_map: dict[int, int] = {}
    texture_cache: dict[int, Texture | None] = {}
    has_uv = has_color = False

    def material_slot(index: int | None) -> int:
        key = -1 if index is None else index
        if key in material_map:
            return material_map[key]
        source = gltf.get("materials", [])[index] if index is not None else {}
        pbr = source.get("pbrMetallicRoughness", {})
        factor = pbr.get("baseColorFactor", [1.0, 1.0, 1.0, 1.0])
        texture = None
        if "baseColorTexture" in pbr:
            texture = _load_gltf_texture(gltf, buffers, base_dir, texture_cache,
                                         pbr["baseColorTexture"]["index"])
        material_map[key] = len(mesh.materials)
        mesh.materials.append(Material(tuple(factor[:3]), texture))
        return material_map[key]

    for node_index, matrix in _iter_gltf_nodes(gltf):
        node = gltf["nodes"][node_index]
        if "mesh" not in node:
            continue
        for primitive in gltf["meshes"][node["mesh"]].get("primitives", []):
            if primitive.get("mode", 4) != 4 or "POSITION" not in primitive.get("attributes", {}):
                continue
            attributes = primitive["attributes"]
            points = _read_accessor(gltf, buffers, attributes["POSITION"])
            base = len(mesh.positions) // 3
            count = len(points) // 3
            for i in range(count):
                mesh.positions.extend(_transform(matrix, points[i * 3], points[i * 3 + 1], points[i * 3 + 2]))

            if "TEXCOORD_0" in attributes:
                uvs.extend(_read_accessor(gltf, buffers, attributes["TEXCOORD_0"]))
                has_uv = True
            else:
                uvs.extend([0.0] * (count * 2))

            if "COLOR_0" in attributes:
                values = _read_accessor(gltf, buffers, attributes["COLOR_0"])
                stride = len(values) // count
                for i in range(count):
                    colors.extend(values[i * stride:i * stride + 3])
                has_color = True
            else:
                colors.extend([1.0] * (count * 3))

            slot = material_slot(primitive.get("material"))
            if "indices" in primitive:
                indices = _read_accessor(gltf, buffers, primitive["indices"])
                for i in range(0, len(indices) - 2, 3):
                    mesh.tris.extend((base + int(indices[i]), base + int(indices[i + 1]), base + int(indices[i + 2])))
                    tri_material.append(slot)
            else:
                for i in range(0, count - 2, 3):
                    mesh.tris.extend((base + i, base + i + 1, base + i + 2))
                    tri_material.append(slot)

    if not mesh.materials:
        mesh.materials.append(Material())
    mesh.tri_material = tri_material
    if has_uv:
        mesh.uvs = uvs
    if has_color:
        mesh.colors = colors
    return mesh


def _read_buffer(buffer: dict, base_dir: str, binary_chunk: bytes) -> bytes:
    uri = buffer.get("uri")
    if not uri:
        return binary_chunk
    if uri.startswith("data:"):
        return base64.b64decode(uri.split(",", 1)[1])
    with open(os.path.join(base_dir, uri), "rb") as handle:
        return handle.read()


def _load_gltf_texture(gltf, buffers, base_dir, cache, texture_index) -> Texture | None:
    source = gltf.get("textures", [])[texture_index].get("source")
    if source is None:
        return None
    if source in cache:
        return cache[source]
    image = gltf.get("images", [])[source]
    data = b""
    if "uri" in image:
        uri = image["uri"]
        if uri.startswith("data:"):
            data = base64.b64decode(uri.split(",", 1)[1])
        else:
            image_path = os.path.join(base_dir, uri)
            if os.path.exists(image_path):
                with open(image_path, "rb") as handle:
                    data = handle.read()
    elif "bufferView" in image:
        view = gltf["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        data = buffers[view.get("buffer", 0)][start:start + view["byteLength"]]
    cache[source] = decode_image(data) if data else None
    return cache[source]


def _read_accessor(gltf: dict, buffers: list[bytes], index: int) -> array:
    accessor = gltf["accessors"][index]
    fmt, size = _GLTF_COMPONENTS[accessor["componentType"]]
    width = _GLTF_TYPE_SIZE[accessor["type"]]
    count = accessor["count"]
    values = array(fmt)
    if "bufferView" in accessor:
        view = gltf["bufferViews"][accessor["bufferView"]]
        data = buffers[view.get("buffer", 0)]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride") or width * size
        if stride == width * size:
            values.frombytes(data[start:start + count * width * size])
            if not _LITTLE_ENDIAN:
                values.byteswap()
        else:
            item = "<" + fmt * width
            for i in range(count):
                values.extend(struct.unpack_from(item, data, start + i * stride))
    else:
        values.extend([0] * (count * width) if fmt != "f" else [0.0] * (count * width))

    if accessor.get("normalized") and accessor["componentType"] in _GLTF_NORMALIZE:
        scale = _GLTF_NORMALIZE[accessor["componentType"]]
        return array("f", [max(v / scale, -1.0) for v in values])
    return values


def _iter_gltf_nodes(gltf: dict):
    """Yield (node index, world matrix) for every node reachable from the default scene."""
    nodes = gltf.get("nodes", [])
    scenes = gltf.get("scenes", [])
    if scenes:
        roots = scenes[gltf.get("scene", 0)].get("nodes", [])
    else:
        children = {c for node in nodes for c in node.get("children", [])}
        roots = [i for i in range(len(nodes)) if i not in children]

    stack = [(index, _IDENTITY) for index in roots]
    while stack:
        index, parent = stack.pop()
        matrix = _matrix_multiply(parent, _node_matrix(nodes[index]))
        yield index, matrix
        for child in nodes[index].get("children", []):
            stack.append((child, matrix))


_IDENTITY = (1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)


def _node_matrix(node: dict) -> tuple:
    if "matrix" in node:
        return tuple(node["matrix"])
    x, y, z, w = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    sx, sy, sz = node.get("scale", [1.0, 1.0, 1.0])
    tx, ty, tz = node.get("translation", [0.0, 0.0, 0.0])
    return (
        (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0.0,
        (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0.0,
        (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0.0,
        tx, ty, tz, 1.0,
    )


def _matrix_multiply(a: tuple, b: tuple) -> tuple:
    out = []
    for column in range(4):
        for row in range(4):
            out.append(sum(a[k * 4 + row] * b[column * 4 + k] for k in range(4)))
    return tuple(out)


def _transform(m: tuple, x: float, y: float, z: float) -> tuple[float, float, float]:
    return (m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14])
