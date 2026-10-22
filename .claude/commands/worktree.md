---
description: Crea un worktree en .trees/<nombre> a partir de un requerimiento y lo implementa dentro de ese worktree
argument-hint: <requerimiento a implementar>
allowed-tools: Bash(git worktree add:*), Bash(git worktree list:*), Bash(git branch:*), Bash(git status:*), Bash(git check-ignore:*), Bash(git rev-parse:*)
---

# /worktree

Requerimiento recibido:

$ARGUMENTS

Sigue estos pasos en orden. Responde siempre en español.

## 1. Validar el requerimiento

Si el requerimiento está vacío, detente y pide al usuario que lo escriba (ejemplo: `/worktree añadir sonido al eliminar líneas`). No crees nada.

## 2. Determinar el nombre del worktree

A partir del requerimiento, elige un nombre que:

- Esté en kebab-case, en minúsculas, sin tildes ni ñ (ñ → n) y sin espacios.
- Tenga entre 1 y 3 palabras que describan la funcionalidad, no la acción (ej.: `sonido-lineas`, `menu-pausa`, `tabla-records`).
- No exista ya: compruébalo con `git worktree list` y `git branch --list <nombre>`. Si existe, añade un sufijo `-2`, `-3`, etc.

## 3. Crear el worktree

1. Si `.trees/` no está ignorada (`git check-ignore -q .trees/` falla), añade la línea `.trees/` a `.git/info/exclude`. Esto evita que un `git add .` en la rama principal registre los worktrees como gitlinks. Usa `.git/info/exclude` y no `.gitignore` porque es local y no genera cambios que commitear.
2. Antes de ejecutarlo, explica en una línea qué hace el comando: crea la carpeta `.trees/<nombre>` y una rama nueva `<nombre>` partiendo del commit actual (HEAD), sin tocar la rama en la que está el usuario.
3. Ejecuta:

```
git worktree add .trees/<nombre>
```

4. Confirma el resultado con `git worktree list`.

## 4. Implementar el requerimiento dentro del worktree

- TODO el trabajo (leer, editar, crear archivos, ejecutar pruebas) se hace en `<raíz del repo>/.trees/<nombre>/`, usando siempre rutas absolutas a esa carpeta. Nunca modifiques archivos de la raíz del repositorio principal.
- Para comandos de shell, usa `git -C .trees/<nombre> ...` o rutas absolutas en lugar de `cd`.
- Lee el código real del worktree antes de cambiarlo y sigue el estilo existente (nombres, comentarios, idioma de la interfaz).
- Aplica buenas prácticas de POO y señala si el código existente se aparta de ellas.
- Implementa el requerimiento completo con precisión. Si alguna parte es ambigua, elige la interpretación más razonable y menciónala en el resumen final.
- Verifica que funciona (por ejemplo, abriendo el juego o ejecutando las pruebas que existan) y que no aparecen errores.

## 5. No hacer commit ni push sin permiso

No hagas `git commit` ni `git push` salvo que el usuario lo pida expresamente. Al terminar, deja los cambios sin commitear en el worktree.

## 6. Resumen final

Informa:

- El nombre elegido y por qué.
- La ruta del worktree y la rama creada.
- Los archivos modificados y qué hace cada cambio.
- Cómo se verificó.
- Los siguientes pasos sugeridos, explicando qué hace cada comando:
  - `git -C .trees/<nombre> add -A` y `git -C .trees/<nombre> commit -m "..."` para guardar los cambios en la rama `<nombre>`.
  - `git merge --no-ff <nombre>` desde la rama principal para integrarlo.
