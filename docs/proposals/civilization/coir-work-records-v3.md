# Coir work records /3

The physical coir model and its assumption ID are unchanged. CORD_WORK host-3
uses civ-world.coir-work/3 and civ-world.coir-arrangement/3.

Completed and abandoned work leaves L.runs after atomic settlement. The
arrangement keeps at most 64 finished projections and public observation/view
summaries, without source lots, work frames, controls or scientific interval
histories. projectCordWork and the existing public readers resolve these recent
summaries. Older products remain ordinary material lots, not replay records.

Exact intent/span payloads are retained for the last 64 commands. Eviction
advances a timestamp floor, so an expired command is rejected rather than being
applied a second time. Current controls older than this floor remain verified by
the active run's rebuilt authority; they do not require an already evicted
receipt.

restoreCordWork validates the original /2 arrangement and all /2 run bindings
before migration. It rebuilds active work with /3 bindings and folds ended runs
into the bounded summaries. It never settles materials again or changes seq.
A save whose old format merely has its schema relabeled is rejected.

The active physical work evidence (frames and controls) is retained in this
change. This bounds repeated completed work and recent replay history; it does
not claim that an indefinitely unfinished job or accumulated physical inventory
has constant size.

Checks add a 200-job plateau, exact recent replay, expiry, continued work after
receipt eviction, /2 running/completed migration compared with a frozen /2
implementation, and rejection of schema relabeling.
