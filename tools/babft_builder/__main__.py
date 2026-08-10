"""Command line entry point: model file in, block build out.

    python -m tools.babft_builder boat.glb --size 60
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time

from . import exporters, fitting, meshio

FORMATS = ("lua", "html", "json", "txt")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.babft_builder",
        description="Convert a 3D model (glb/gltf/obj/stl/ply) into stretched, tilted blocks.")
    parser.add_argument("model", help="input mesh file")
    parser.add_argument("--out", help="output directory (default: next to the input file)")
    parser.add_argument("--name", help="base name for the output files (default: the model's)")
    parser.add_argument("--formats", default="lua,html,json,txt",
                        help=f"comma separated subset of {','.join(FORMATS)}")

    parser.add_argument("--mode", choices=("plates", "voxel"), default="plates",
                        help="plates: tilted panels that follow the surface. voxel: grid boxes.")
    parser.add_argument("--size", type=float, default=40.0,
                        help="length of the model's longest side, in studs (default 40)")
    parser.add_argument("--up", choices=("y", "z"), default="y",
                        help="which axis is up in the source file (default y)")
    parser.add_argument("--colors", type=int, default=0,
                        help="reduce to at most this many colours (0 keeps every colour)")
    parser.add_argument("--angle-step", type=float, default=0.0,
                        help="round every rotation to a multiple of this many degrees")
    parser.add_argument("--material", default="SmoothPlastic",
                        help="Enum.Material name used by the Studio script")

    plates = parser.add_argument_group("plates mode")
    plates.add_argument("--thickness", type=float, default=0.5,
                        help="minimum panel thickness in studs (default 0.5)")
    plates.add_argument("--angle-tol", type=float, default=20.0,
                        help="how far a face may tilt and still join a panel, in degrees")
    plates.add_argument("--flat-tol", type=float,
                        help="how far a face may bulge off a panel's plane, in studs "
                             "(default: 2%% of --size)")
    plates.add_argument("--fill", type=float, default=2.0,
                        help="how much bigger than the surface it covers a panel may get "
                             "(1.0 keeps panels exactly rectangular, higher lets them overhang)")
    plates.add_argument("--min-area", type=float,
                        help="drop panels smaller than this, in square studs "
                             "(default: the square of --flat-tol)")
    plates.add_argument("--max-blocks", type=int, default=0,
                        help="loosen the tolerances until the build fits in this many blocks")

    voxel = parser.add_argument_group("voxel mode")
    voxel.add_argument("--resolution", type=int, default=40,
                       help="cells along the longest side (default 40)")
    voxel.add_argument("--solid", action="store_true", help="fill the inside as well")
    voxel.add_argument("--no-merge", action="store_true",
                       help="keep single cells instead of merging them into stretched boxes")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

    formats = [f.strip() for f in args.formats.split(",") if f.strip()]
    unknown = [f for f in formats if f not in FORMATS]
    if unknown:
        logging.error("unknown output format(s): %s", ", ".join(unknown))
        return 2

    start = time.perf_counter()
    try:
        mesh = meshio.load(args.model)
    except (OSError, ValueError) as error:
        logging.error("could not read %s: %s", args.model, error)
        return 1
    if mesh.triangle_count == 0:
        logging.error("%s has no triangles", args.model)
        return 1
    logging.info("loaded %s: %d triangles, %d vertices",
                 os.path.basename(args.model), mesh.triangle_count, mesh.vertex_count)

    info = fitting.prepare(mesh, up=args.up, target_size=args.size)
    logging.info("scaled to %.1f x %.1f x %.1f studs (x%.4g)", *info["size"], info["scale"])
    if args.mode == "plates":
        # The surface tolerances are shape tolerances, so they follow the build's scale
        # unless the user pins them down.
        flat_tol = args.flat_tol if args.flat_tol is not None else args.size * 0.02
        min_area = args.min_area if args.min_area is not None else flat_tol ** 2
        blocks = fitting.fit_plates(mesh, thickness=args.thickness, angle_tol=args.angle_tol,
                                    flat_tol=flat_tol, min_area=min_area,
                                    fill=args.fill, max_blocks=args.max_blocks)
    else:
        blocks = fitting.fit_voxels(mesh, resolution=args.resolution, solid=args.solid,
                                    merge=not args.no_merge, colors=args.colors)
    if not blocks:
        logging.error("no blocks were produced - try a smaller --min-area or a higher --resolution")
        return 1

    fitting.snap_angles(blocks, args.angle_step)
    fitting.limit_palette(blocks, args.colors)

    records = exporters.block_records(blocks)
    meta = {
        "source": os.path.basename(args.model),
        "mode": args.mode,
        "size": [round(v, 2) for v in info["size"]],
        "blocks": len(records),
    }

    out_dir = args.out or os.path.dirname(os.path.abspath(args.model))
    os.makedirs(out_dir, exist_ok=True)
    name = args.name or os.path.splitext(os.path.basename(args.model))[0]
    written = []
    for kind in formats:
        path = os.path.join(out_dir, f"{name}.{kind}")
        if kind == "lua":
            exporters.write_lua(path, records, name=name, material=args.material)
        elif kind == "html":
            exporters.write_html(path, records, meta)
        elif kind == "json":
            exporters.write_json(path, records, meta)
        else:
            exporters.write_sheet(path, records, meta)
        written.append(path)

    logging.info("%d blocks, %d colours (%.1fs)", len(records),
                 len(exporters.palette_of(records)), time.perf_counter() - start)
    for path in written:
        logging.info("  wrote %s", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
