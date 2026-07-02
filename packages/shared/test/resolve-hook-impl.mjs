export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js') && !context.parentURL?.endsWith('.mjs')) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(specifier.slice(0, -3) + '.ts', context);
    }
  }
  return nextResolve(specifier, context);
}
