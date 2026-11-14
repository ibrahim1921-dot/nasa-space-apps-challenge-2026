import { copy } from "@/content/ui";
import Link from 'next/link';
export default function NotFound() {
  return <section className="empty"><p className="eyebrow">{copy.app_not_found.off_course}</p><h1>{copy.app_not_found.this_page_is_beyond_our_orbit}</h1><Link className="button" href="/">{copy.app_not_found.return_to_crew_profiles}</Link></section>;
}
