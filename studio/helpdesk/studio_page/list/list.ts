import { ref } from "vue"

export default function setup(context) {
	// Reactive state, computed values, watchers and functions for this page.
	// Read this page's data sources and variables from context, e.g. context.todos
	const btnLabel = ref("Create New")
	const showCreateDialog = ref(false)

	return {
		btnLabel,
		showCreateDialog
	}
}
