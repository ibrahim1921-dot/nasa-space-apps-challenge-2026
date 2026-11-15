import '../../ground/styles/ground.css';

export const metadata = {
  title: 'Mission Control · Flight surgeon',
};

// The ground console lives inside the root layout (fonts, theme and the crew app's shared component
// styles). Its own styles are all prefixed .gr- so they never touch the crew app.
export default function GroundLayout({ children }) {
  return children;
}
