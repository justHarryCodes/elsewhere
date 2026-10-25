# Art source files

Original files for the assets in `apps/client/public/assets/`, in formats the browser can't load:
FBX, OBJ/MTL, Blender, DAE, STL, previews and pack zips. They are kept for editing and conversion
and are **not** shipped with the game.

The layout mirrors `apps/client/public/assets/`: `<category>/<pack>/`, with each pack's original
internal folders kept. To use a model in the game, export it to `.glb` and put it in the matching
public folder.
