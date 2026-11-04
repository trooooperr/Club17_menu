export default function sitemap() {
  const baseUrl = 'https://www.humtumbar.in';

  // Define static routes in the restaurant app
  const routes = [
    '',
    '/about',
    '/menu',
    '/reserve',
    '/bar',
    '/events',
    '/contact',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));

  return routes;
}
