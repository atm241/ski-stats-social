import { UserCheck, UserPlus } from "lucide-react";
import { setFollow } from "@/app/actions";

export function FollowButton({ username, following }: { username: string; following: boolean }) {
  return (
    <form action={setFollow.bind(null, username, !following)}>
      <button className={following ? "btn-ghost" : "btn-primary"}>
        {following ? <UserCheck size={15} aria-hidden /> : <UserPlus size={15} aria-hidden />}
        {following ? "Following" : "Follow"}
      </button>
    </form>
  );
}
