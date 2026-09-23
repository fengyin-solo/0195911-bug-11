<template>
  <div class="text-element" :style="textStyle" @dblclick="startEdit">
    <span v-if="!isEditing">{{ element.content }}</span>
    <input 
      v-else
      ref="inputRef"
      v-model="editContent"
      class="text-input"
      :style="inputStyle"
      @blur="finishEdit"
      @keydown.enter="finishEdit"
      @keydown.esc="cancelEdit"
      @mousedown.stop
      @click.stop
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps({ element: { type: Object, required: true } })
const store = useCanvasStore()

const isEditing = ref(false)
const editContent = ref('')
const inputRef = ref(null)

const textStyle = computed(() => ({
  fontSize: `${props.element.fontSize || 14}px`,
  fontFamily: props.element.fontFamily || 'Arial',
  color: props.element.color || '#000000',
  fontWeight: props.element.bold ? 'bold' : 'normal',
  fontStyle: props.element.italic ? 'italic' : 'normal'
}))

const inputStyle = computed(() => ({
  fontSize: `${props.element.fontSize || 14}px`,
  fontFamily: props.element.fontFamily || 'Arial',
  color: props.element.color || '#000000',
  fontWeight: props.element.bold ? 'bold' : 'normal',
  fontStyle: props.element.italic ? 'italic' : 'normal'
}))

const startEdit = async () => {
  isEditing.value = true
  editContent.value = props.element.content || ''
  await nextTick()
  if (inputRef.value) {
    inputRef.value.focus()
    inputRef.value.select()
  }
}

const finishEdit = () => {
  if (editContent.value !== props.element.content) {
    store.updateElement(props.element.id, { content: editContent.value })
  }
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
}

defineExpose({ startEdit })
</script>

<style scoped>
.text-element {
  width: 100%; height: 100%; display: flex; align-items: center;
  user-select: none; overflow: hidden; white-space: nowrap; line-height: 1;
}
.text-input {
  width: 100%; height: 100%; border: none; outline: none;
  background: rgba(255,255,255,0.9); padding: 0 2px;
}
</style>
