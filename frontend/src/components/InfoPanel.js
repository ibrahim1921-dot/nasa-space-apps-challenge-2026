import styles from './ui.module.css';
import SourceLabel from './SourceLabel';
export default function InfoPanel({
  title,
  children,
  source = 'synthetic',
  className = ''
}) {
  return <section className={`${styles.panel} ${className}`}>{title && <h2>{title}</h2>}{children}<SourceLabel source={source} /></section>;
}
