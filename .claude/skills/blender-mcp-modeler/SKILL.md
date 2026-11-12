---
name: blender-mcp-modeler
description: Mandatory rules for building any 3D model through the Blender MCP (execute_blender_code, get_scene_info, look / get_viewport_screenshot) or headless Blender Python. Use whenever you model, remodel or add a prop, character or environment piece in Blender. Real bmesh shaping and non-destructive modifier stacks, applied transforms, and a look after every major step.
license: MIT
metadata:
  domain: blender
  role: rules
  triggers: blender, bpy, bmesh, model, remodel, prop, mesh, modifier, execute_blender_code, blender mcp
  related-skills: blender-modeler, hard-surface, uv-workflow, asset-optimization, export-pipeline
---

# Blender MCP Modeler: the rules

These rules are not optional. Follow every one of them on every model you build through the Blender MCP, or through `blender -b -P script.py` when the MCP is down.

## 1. Start by reading the scene

- Before touching anything, call **`get_scene_info`**. Ask for `settings` and `details` the first time. Note the unit scale, what is already there, and its names, sizes and transforms.
- Call `get_addon_status` once per session for the Blender version, and read enum and node identifiers from `bl_rna` instead of hardcoding them.

## 2. No lazy primitive models

- **Never** build a model by sticking or intersecting basic primitives (cubes, cylinders, spheres, cones) and calling it done. A stack of boxes is not a book, and a cylinder with a sphere on top is not a candlestick.
- A primitive may only be the **starting mesh** for real shaping. Its form must then come from edited geometry.
- Turned forms (cups, candlesticks, bottles, pieces) are built from a drawn profile: a lathe via bmesh `spin`, or a Screw modifier over an edited profile curve. Stacked cylinders are not acceptable.

## 3. Shape real geometry with bmesh

Do the shaping in `bmesh` (`import bmesh`; `bm = bmesh.new()`; `bm.from_mesh(me)` … `bm.to_mesh(me)`; `bm.free()`), with the actual operators:

- **Extrusions:** `bmesh.ops.extrude_face_region`, `extrude_edge_only` and `extrude_discrete_faces`, then translate or scale the new geometry.
- **Insets:** `bmesh.ops.inset_region` and `inset_individual`, for panels, rims, lids, recesses and raised bands.
- **Bevels:** `bmesh.ops.bevel`, on chosen edges or verts, for edges that are part of the shape (a lid lip, a rounded spine).
- **Loop cuts:** `bmesh.ops.subdivide_edgering`, or `bisect_plane` / `subdivide_edges` on an edge ring, to add support loops and control silhouette.
- Also `spin` for profiles, `bridge_loops`, `dissolve_*`, `remove_doubles` and `recalc_face_normals`.

After every bmesh pass, check the result: no loose verts, no inside faces, and normals recalculated and facing out.

## 4. Apply scale and rotation before any modifier

Bevel width, Solidify thickness, Mirror axes and Weighted Normal all go wrong on unapplied transforms. Do this before adding the first modifier:

```python
import bpy
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True); bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
```

Headless, with no operator context, bake the matrix into the mesh instead: `me.transform(obj.matrix_basis)`, then reset `obj.matrix_basis` and keep the location.

## 5. Use a non-destructive modifier stack

Detail and finish come from modifiers, kept live until export. The usual order, top to bottom:

1. **Mirror:** symmetry, with clipping on and merge on.
2. **Solidify:** thickness for sheets (cloth, paper, shells), with even thickness and rim fill.
3. **Boolean:** cuts and recesses from a hidden cutter object. Use the Exact solver and keep the cutter.
4. **Bevel:** `limit_method = "ANGLE"` (about 30°), 2 segments, width in real units, `harden_normals` on.
5. **Subdivision Surface:** only where a soft form needs it, at a low level, after support loops are in place.
6. **Weighted Normal:** last, with `keep_sharp` on. Set mesh auto-smooth or "Smooth by Angle" first, as the Blender version requires.

Apply modifiers only at export (the glTF exporter's `export_apply=True`), or when a later step truly needs real geometry, such as baking or a decimate to budget.

## 6. Look after every major step

After each major modeling step (the blockout, each shaping pass, the modifier stack, materials, and the final pose and placement), take a screenshot:

- With the MCP for Blender server, call **`look`**. Use `mode="angles"` on the target for form and proportion, `shading="wireframe"` for topology, and `shading="material"` for colour.
- With a server that exposes **`get_viewport_screenshot`**, call that.
- Headless, render a quick Workbench or EEVEE image to a file and read it.

Inspect each image for proportions against real scale, clipping and intersecting parts, broken or flipped normals (dark patches, see-through faces), shading artefacts and silhouette. **Fix what you see before moving on.** Never stack a new step on a broken one.

## 7. Before you call it done

- Run `get_scene_info` with `fields=["topology","details","modifiers"]`. Check for non-manifold edges where there should be none, loose verts, ngons on curved surfaces, and the tri count against budget.
- Look one last time from the angle the model will actually be seen from in the app.
- Export with consistent conventions (units, up axis, origin at the base centre, transforms applied, names stable), following the project's own guide when there is one. In Tallow that guide is `docs/ART.md`.
