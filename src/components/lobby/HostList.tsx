import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../../theme/colors';

type HostListProps = {
  hosts: { id: string; name: string }[];
  onSelect: (hostId: string) => void;
};

export function HostList({ hosts, onSelect }: HostListProps) {
  if (hosts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={Colors.active} />
        <Text style={styles.emptyText}>ホストを探しています...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={hosts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          testID={`host-${item.id}`}
          style={styles.hostItem}
          onPress={() => onSelect(item.id)}
        >
          <Text style={styles.hostName}>{item.name}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    color: Colors.subText,
    fontSize: 14,
  },
  hostItem: {
    backgroundColor: '#374151',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  hostName: {
    color: Colors.text,
    fontSize: 16,
  },
});
