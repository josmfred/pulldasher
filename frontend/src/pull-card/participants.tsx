import { Pull } from "../pull";
import {
  Box
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

// A single indicator whose shape encodes the number of participants
// (one / many / none-is-blank) and whose color encodes the current user's
// relationship to the pull: assigned, participating, or neither.
export function Participants({ pull }: { pull: Pull }) {
  const count = pull.participants?.length ?? 0;
  if (!count && !pull.assignedToMe()) {
    return null;
  }
  return (
    <Box position="absolute" top="2px" right="5px">
      <FontAwesomeIcon
        icon={count > 1 ? faUsers : faUser}
        title={tooltip(pull)}
        color={color(pull)}
      />
    </Box>
  );
}

function color(pull: Pull) {
  if (pull.assignedToMe()) {
    return "var(--assignee-icon)";
  }
  return pull.participating()
    ? "var(--participants-including-me)"
    : "var(--participants-without-me)";
}

function tooltip(pull: Pull) {
  const count = pull.participants?.length ?? 0;
  const participants =
    count === 0
      ? null
      : count === 1
        ? pull.participating()
          ? "only you participating"
          : "1 participant"
        : pull.participating()
          ? `${count} participants (including you)`
          : `${count} participants`;

  if (pull.assignedToMe()) {
    return participants ? `Assigned to you, ${participants}` : "Assigned to you";
  }
  return participants
    ? participants.charAt(0).toUpperCase() + participants.slice(1)
    : "";
}
